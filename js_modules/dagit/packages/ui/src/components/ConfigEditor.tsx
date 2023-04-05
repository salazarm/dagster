import 'codemirror/addon/comment/comment';
import 'codemirror/addon/dialog/dialog';
import 'codemirror/addon/fold/foldgutter';
import 'codemirror/addon/fold/foldgutter.css';
import 'codemirror/addon/fold/indent-fold';
import 'codemirror/addon/hint/show-hint';
import 'codemirror/addon/hint/show-hint.css';
import 'codemirror/addon/lint/lint.css';
import 'codemirror/addon/search/jump-to-line';
import 'codemirror/addon/search/search';
import 'codemirror/addon/search/searchcursor';
import 'codemirror/keymap/sublime';

import {Editor} from 'codemirror';
import debounce from 'lodash/debounce';
import * as React from 'react';
import {createGlobalStyle} from 'styled-components/macro';
import * as yaml from 'yaml';

import {StyledCodeMirror} from './CodeMirror';
import {patchLint} from './configeditor/codemirror-yaml/lint';
import {
  YamlModeValidateFunction,
  expandAutocompletionContextAtCursor,
  findRangeInDocumentFromPath,
  YamlModeValidationResult,
} from './configeditor/codemirror-yaml/mode'; // eslint-disable-line import/no-duplicates
import {ConfigEditorHelpContext} from './configeditor/types/ConfigEditorHelpContext';
import {ConfigSchema} from './configeditor/types/ConfigSchema';

import { useRef, useEffect, useCallback } from 'react';

export {isHelpContextEqual} from './configeditor/isHelpContextEqual';
export {ConfigEditorHelp} from './configeditor/ConfigEditorHelp';

export type {ConfigEditorHelpContext, ConfigSchema, YamlModeValidationResult};

patchLint();

interface ConfigEditorProps {
  configCode: string;
  readOnly: boolean;
  configSchema?: ConfigSchema | null;

  checkConfig: YamlModeValidateFunction;
  onConfigChange: (newValue: string) => void;
  onHelpContextChange: (helpContext: ConfigEditorHelpContext | null) => void;
}

const AUTO_COMPLETE_AFTER_KEY = /^[a-zA-Z0-9_@(]$/;
const performLint = debounce((editor: any) => {
  editor.performLint();
}, 1000);

const ConfigEditorStyle = createGlobalStyle`
  .react-codemirror2 .CodeMirror.cm-s-config-editor {
    height: initial;
    position: absolute;
    inset: 0;
  }
`;

const ConfigEditor = (props: ConfigEditorProps) => {
  useEffect(() => {
    if (!_editorHandler) {
      return;
    }
    if (prevProps.configSchema === props.configSchema) {
      return;
    }
    performInitialPassHandler();
  }, []);

  const shouldComponentUpdateHandler = useCallback((prevProps: ConfigEditorProps) => {
    // Unfortunately, updates to the ConfigEditor clear the linter highlighting for
    // unknown reasons and they're recalculated asynchronously. To prevent flickering,
    // only update if our input has meaningfully changed.
    return prevProps.configCode !== props.configCode ||
    prevProps.readOnly !== props.readOnly ||
    prevProps.configSchema !== props.configSchema;
  }, []);

  const moveCursorHandler = useCallback((line: number, ch: number) => {
    if (!_editorHandler) {
      return;
    }
    _editorHandler.setCursor(line, ch, {scroll: false});
    const {clientHeight} = _editorHandler.getScrollInfo();
    const {left, top} = _editorHandler.cursorCoords(true, 'local');
    const offsetFromTop = 20;

    _editorHandler?.scrollIntoView({
      left,
      right: left,
      top: top - offsetFromTop,
      bottom: top + (clientHeight - offsetFromTop),
    });
    _editorHandler.focus();
  }, []);

  const moveCursorToPathHandler = useCallback((path: string[]) => {
    if (!_editorHandler) {
      return;
    }
    const codeMirrorDoc = _editorHandler.getDoc();
    const yamlDoc = yaml.parseDocument(props.configCode);
    const range = findRangeInDocumentFromPath(yamlDoc, path, 'key');
    if (!range) {
      return;
    }
    const from = codeMirrorDoc.posFromIndex(range ? range.start : 0) as CodeMirror.Position;
    moveCursorHandler(from.line, from.ch);
  }, []);

  const performInitialPassHandler = useCallback(() => {
    // update the gutter and redlining
    performLint(_editorHandler);

    // update the contextual help based on the configSchema and content
    const {context} = expandAutocompletionContextAtCursor(_editorHandler);
    props.onHelpContextChange(context ? {type: context.closestMappingType} : null);
  }, []);

  const _editor = useRef(null);
  // Unfortunately, CodeMirror is too intense to be simulated in the JSDOM "virtual" DOM.
  // Until we run tests against something like selenium, trying to render the editor in
  // tests have to stop here.
  if (process.env.NODE_ENV === 'test') {
    return <span />;
  }

  return (
    <div style={{flex: 1, position: 'relative'}}>
      <ConfigEditorStyle />
      <StyledCodeMirror
        value={props.configCode}
        theme={['config-editor']}
        options={
          {
            mode: 'yaml',
            lineNumbers: true,
            readOnly: props.readOnly,
            indentUnit: 2,
            smartIndent: true,
            showCursorWhenSelecting: true,
            lintOnChange: false,
            lint: {
              checkConfig: props.checkConfig,
              lintOnChange: false,
              onUpdateLinting: false,
            },
            hintOptions: {
              completeSingle: false,
              closeOnUnfocus: false,
              schema: props.configSchema,
            },
            keyMap: 'sublime',
            extraKeys: {
              'Cmd-Space': (editor: any) => editor.showHint({completeSingle: true}),
              'Ctrl-Space': (editor: any) => editor.showHint({completeSingle: true}),
              'Alt-Space': (editor: any) => editor.showHint({completeSingle: true}),
              'Shift-Tab': (editor: any) => editor.execCommand('indentLess'),
              Tab: (editor: any) => editor.execCommand('indentMore'),
              // Persistent search box in Query Editor
              'Cmd-F': 'findPersistent',
              'Ctrl-F': 'findPersistent',
            },
            gutters: [
              'CodeMirror-foldgutter',
              'CodeMirror-lint-markers',
              'CodeMirror-linenumbers',
            ],
            foldGutter: true,
          } as any
        }
        editorDidMount={(editor) => {
          _editorHandler = editor;
          performInitialPassHandler();
        }}
        onBeforeChange={(editor, data, value) => {
          props.onConfigChange(value);
        }}
        onCursorActivity={(editor: any) => {
          if (editor.getSelection().length) {
            props.onHelpContextChange(null);
          } else {
            const {context} = expandAutocompletionContextAtCursor(editor);
            props.onHelpContextChange(context ? {type: context.closestMappingType} : null);
          }
        }}
        onChange={(editor: Editor) => {
          performLint(editor);
        }}
        onBlur={(editor: Editor) => {
          performLint(editor);
        }}
        onKeyUp={(editor, event: KeyboardEvent) => {
          if (AUTO_COMPLETE_AFTER_KEY.test(event.key)) {
            editor.execCommand('autocomplete');
          }
        }}
      />
    </div>
  );
};

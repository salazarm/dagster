import {gql} from '@apollo/client';
import {Colors} from '@dagster-io/ui';
import * as React from 'react';
import styled from 'styled-components/macro';

import {OpNameOrPath} from '../ops/OpNameOrPath';

import {OpEdges} from './OpEdges';
import {OpNode, OP_NODE_DEFINITION_FRAGMENT, OP_NODE_INVOCATION_FRAGMENT} from './OpNode';
import {ParentOpNode, SVGLabeledParentRect} from './ParentOpNode';
import {DETAIL_ZOOM, SVGViewport, SVGViewportInteractor} from './SVGViewport';
import {OpGraphLayout} from './asyncGraphLayout';
import {
  Edge,
  closestNodeInDirection,
  computeNodeKeyPrefixBoundingBoxes,
  isHighlighted,
  isNodeOffscreen,
  isOpHighlighted,
} from './common';
import {OpGraphOpFragment} from './types/OpGraph.types';

import { useRef, useCallback, useEffect } from 'react';

const NoOp = () => {};

interface OpGraphProps {
  jobName: string;
  layout: OpGraphLayout;
  ops: OpGraphOpFragment[];
  focusOps: OpGraphOpFragment[];
  parentHandleID?: string;
  parentOp?: OpGraphOpFragment;
  selectedHandleID?: string;
  selectedOp?: OpGraphOpFragment;
  highlightedOps: Array<OpGraphOpFragment>;
  interactor?: SVGViewportInteractor;
  onClickOp?: (arg: OpNameOrPath) => void;
  onDoubleClickOp?: (arg: OpNameOrPath) => void;
  onEnterSubgraph?: (arg: OpNameOrPath) => void;
  onLeaveSubgraph?: () => void;
  onClickBackground?: () => void;
}

interface OpGraphContentsProps extends OpGraphProps {
  minified: boolean;
  layout: OpGraphLayout;
  viewportRect: {top: number; left: number; right: number; bottom: number};
}

const OpGraphContents: React.FC<OpGraphContentsProps> = React.memo((props) => {
  const [highlighted, setHighlighted] = React.useState<Edge[]>(() => []);

  const {
    layout,
    minified,
    ops,
    viewportRect,
    focusOps,
    parentOp,
    parentHandleID,
    onClickOp = NoOp,
    onDoubleClickOp = NoOp,
    onEnterSubgraph = NoOp,
    highlightedOps,
    selectedOp,
  } = props;

  return (
    <>
      {parentOp && layout.parent && layout.parent.invocationBoundingBox.width > 0 && (
        <SVGLabeledParentRect
          {...layout.parent.invocationBoundingBox}
          key={`composite-rect-${parentHandleID}`}
          label=""
          fill={Colors.Yellow50}
          minified={minified}
        />
      )}
      {parentOp && (
        <ParentOpNode
          onClickOp={onClickOp}
          onDoubleClick={(name) => onDoubleClickOp({name})}
          onHighlightEdges={setHighlighted}
          highlightedEdges={highlighted}
          key={`composite-rect-${parentHandleID}-definition`}
          minified={minified}
          op={parentOp}
          layout={layout}
        />
      )}
      <OpEdges
        ops={ops}
        layout={layout}
        color={Colors.KeylineGray}
        edges={layout.edges}
        onHighlight={setHighlighted}
      />
      <OpEdges
        ops={ops}
        layout={layout}
        color={Colors.Blue500}
        onHighlight={setHighlighted}
        edges={layout.edges.filter(({from, to}) =>
          isHighlighted(highlighted, {a: from.opName, b: to.opName}),
        )}
      />
      {computeNodeKeyPrefixBoundingBoxes(layout).map((box, idx) => (
        <rect
          key={idx}
          {...box}
          stroke="rgb(230, 219, 238)"
          fill="rgba(230, 219, 238, 0.2)"
          strokeWidth={2}
        />
      ))}
      <foreignObject width={layout.width} height={layout.height} style={{pointerEvents: 'none'}}>
        {ops
          .filter((op) => !isNodeOffscreen(layout.nodes[op.name].bounds, viewportRect))
          .map((op) => (
            <OpNode
              key={op.name}
              invocation={op}
              definition={op.definition}
              minified={minified}
              onClick={() => onClickOp({name: op.name})}
              onDoubleClick={() => onDoubleClickOp({name: op.name})}
              onEnterComposite={() => onEnterSubgraph({name: op.name})}
              onHighlightEdges={setHighlighted}
              layout={layout.nodes[op.name]}
              selected={selectedOp === op}
              focused={focusOps.includes(op)}
              highlightedEdges={
                isOpHighlighted(highlighted, op.name) ? highlighted : EmptyHighlightedArray
              }
              dim={highlightedOps.length > 0 && highlightedOps.indexOf(op) === -1}
            />
          ))}
      </foreignObject>
    </>
  );
});

OpGraphContents.displayName = 'OpGraphContents';

// This is a specific empty array we pass to represent the common / empty case
// so that OpNode can use shallow equality comparisons in shouldComponentUpdate.
const EmptyHighlightedArray: never[] = [];

const OpGraph = (props: OpGraphProps) => {
  const {
    layout,
    interactor,
    jobName,
    onClickBackground,
    onDoubleClickOp
  } = props;

  useEffect(() => {
    if (prevProps.parentOp !== props.parentOp) {
      viewportElHandler.current!.cancelAnimations();
      viewportElHandler.current!.autocenter();
    }
    if (prevProps.layout !== props.layout) {
      viewportElHandler.current!.autocenter();
    }
    if (prevProps.selectedOp !== props.selectedOp && props.selectedOp) {
      centerOpHandler(props.selectedOp);
    }
  }, []);

  const argToOpLayoutHandler = useCallback((arg: OpNameOrPath) => {
    const lastName = 'name' in arg ? arg.name : arg.path[arg.path.length - 1];
    return props.layout.nodes[lastName];
  }, []);

  const centerOpHandler = useCallback((arg: OpNameOrPath) => {
    const opLayout = argToOpLayoutHandler(arg);
    if (opLayout && viewportElHandler.current) {
      viewportElHandler.current.zoomToSVGBox(opLayout.bounds, true);
    }
  }, []);

  const focusOnOpHandler = useCallback((arg: OpNameOrPath) => {
    const opLayout = argToOpLayoutHandler(arg);
    if (opLayout && viewportElHandler.current) {
      viewportElHandler.current?.zoomToSVGBox(opLayout.bounds, true, DETAIL_ZOOM);
    }
  }, []);

  const unfocusHandler = useCallback((e: React.MouseEvent<any>) => {
    viewportElHandler.current!.autocenter(true);
    e.stopPropagation();
  }, []);

  const onArrowKeyDownHandler = useCallback((_e: React.KeyboardEvent<any>, dir: string) => {
    const nextOp = closestNodeInDirection(props.layout, props.selectedOp?.name, dir);
    if (nextOp && props.onClickOp) {
      props.onClickOp({name: nextOp});
    }
  }, []);

  const viewportEl = useRef(React.createRef());

  return (
    <SVGViewport
      ref={viewportElHandler}
      key={jobName}
      maxZoom={1.2}
      interactor={interactor || SVGViewport.Interactors.PanAndZoom}
      graphWidth={layout.width}
      graphHeight={layout.height}
      onClick={onClickBackground}
      onDoubleClick={unfocusHandler}
      onArrowKeyDown={onArrowKeyDownHandler}
    >
      {({scale}, viewportRect) => (
        <SVGContainer width={layout.width} height={layout.height + 200}>
          <OpGraphContents
            {...props}
            layout={layout}
            minified={scale < DETAIL_ZOOM - 0.01}
            onDoubleClickOp={onDoubleClickOp || focusOnOpHandler}
            viewportRect={viewportRect}
          />
        </SVGContainer>
      )}
    </SVGViewport>
  );
};

export const OP_GRAPH_OP_FRAGMENT = gql`
  fragment OpGraphOpFragment on Solid {
    name
    ...OpNodeInvocationFragment
    definition {
      name
      ...OpNodeDefinitionFragment
    }
  }

  ${OP_NODE_INVOCATION_FRAGMENT}
  ${OP_NODE_DEFINITION_FRAGMENT}
`;

const SVGContainer = styled.svg`
  overflow: visible;
  border-radius: 0;
`;

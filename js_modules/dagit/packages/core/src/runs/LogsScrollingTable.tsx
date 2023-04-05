import {gql} from '@apollo/client';
import {Colors, NonIdealState} from '@dagster-io/ui';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {CellMeasurer, CellMeasurerCache, List, ListRowProps, ScrollParams} from 'react-virtualized';
import styled from 'styled-components/macro';

import {LogFilter, LogsProviderLogs} from './LogsProvider';
import {
  LOGS_ROW_STRUCTURED_FRAGMENT,
  LOGS_ROW_UNSTRUCTURED_FRAGMENT,
  Structured,
  Unstructured,
} from './LogsRow';
import {ColumnWidthsProvider, Headers} from './LogsScrollingTableHeader';
import {IRunMetadataDict} from './RunMetadataProvider';
import {eventTypeToDisplayType} from './getRunFilterProviders';
import {logNodeLevel} from './logNodeLevel';
import {RunDagsterRunEventFragment} from './types/RunFragments.types';

import { useRef, useCallback, useEffect, useState } from 'react';

const LOGS_PADDING_BOTTOM = 50;

interface ILogsScrollingTableProps {
  logs: LogsProviderLogs;
  filter: LogFilter;
  filterStepKeys: string[];

  // We use this string to know whether the changes to `nodes` require us to
  // re-layout the entire table. Appending new rows can be done very fast, but
  // removing some rows requires the whole list be "reflowed" again. Checking
  // `nodes` for equality doesn't let us optimize for the append- case.
  filterKey: string;
  metadata: IRunMetadataDict;
}

interface ILogsScrollingTableSizedProps {
  width: number;
  height: number;

  filteredNodes: (RunDagsterRunEventFragment & {clientsideKey: string})[];
  textMatchNodes: (RunDagsterRunEventFragment & {clientsideKey: string})[];

  filterKey: string;
  loading: boolean;
  focusedTime: number;
  metadata: IRunMetadataDict;
}

function filterLogs(logs: LogsProviderLogs, filter: LogFilter, filterStepKeys: string[]) {
  const filteredNodes = logs.allNodes.filter((node) => {
    // These events are used to determine which assets a run will materialize and are not intended
    // to be displayed in Dagit. Pagination is offset based, so we remove these logs client-side.
    if (node.__typename === 'AssetMaterializationPlannedEvent') {
      return false;
    }
    const l = logNodeLevel(node);
    if (!filter.levels[l]) {
      return false;
    }
    if (filter.sinceTime && Number(node.timestamp) < filter.sinceTime) {
      return false;
    }
    return true;
  });

  const hasTextFilter = !!(filter.logQuery.length && filter.logQuery[0].value !== '');

  const textMatchNodes = hasTextFilter
    ? filteredNodes.filter((node) => {
        return (
          filter.logQuery.length > 0 &&
          filter.logQuery.every((f) => {
            if (f.token === 'query') {
              return node.stepKey && filterStepKeys.includes(node.stepKey);
            }
            if (f.token === 'step') {
              return node.stepKey && node.stepKey === f.value;
            }
            if (f.token === 'type') {
              return node.eventType && f.value === eventTypeToDisplayType(node.eventType);
            }
            return node.message.toLowerCase().includes(f.value.toLowerCase());
          })
        );
      })
    : [];

  return {
    filteredNodes: hasTextFilter && filter.hideNonMatches ? textMatchNodes : filteredNodes,
    textMatchNodes,
  };
}

export const LogsScrollingTable: React.FC<ILogsScrollingTableProps> = (props) => {
  const {filterKey, filterStepKeys, metadata, filter, logs} = props;
  const table = React.useRef<LogsScrollingTableSized>(null);

  return (
    <ColumnWidthsProvider onWidthsChanged={() => table.current && table.current.didResize()}>
      <Headers />
      <div style={{flex: 1, minHeight: 0, marginTop: -1}}>
        <AutoSizer>
          {({width, height}) => (
            <LogsScrollingTableSized
              width={width}
              height={height}
              ref={table}
              filterKey={filterKey}
              loading={logs.loading}
              metadata={metadata}
              focusedTime={filter.focusedTime}
              {...filterLogs(logs, filter, filterStepKeys)}
            />
          )}
        </AutoSizer>
      </div>
    </ColumnWidthsProvider>
  );
};

export const LOGS_SCROLLING_TABLE_MESSAGE_FRAGMENT = gql`
  fragment LogsScrollingTableMessageFragment on DagsterRunEvent {
    __typename
    ...LogsRowStructuredFragment
    ...LogsRowUnstructuredFragment
  }

  ${LOGS_ROW_STRUCTURED_FRAGMENT}
  ${LOGS_ROW_UNSTRUCTURED_FRAGMENT}
`;

const LogsScrollingTableSized = (props: ILogsScrollingTableSizedProps) => {
  const {
    filteredNodes,
    height,
    loading,
    width
  } = props;

  useEffect(() => {
    attachScrollToBottomObserverHandler();
    if (props.focusedTime) {
      window.requestAnimationFrame(() => {
        scrollToTimeHandler(props.focusedTime);
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (scrollToBottomObserverHandler) {
        scrollToBottomObserverHandler.disconnect();
      }
    };
  });

  useEffect(() => {
    if (!listHandler.current) {
      return;
    }

    if (props.width !== prevProps.width) {
      didResizeHandler();
    }
    if (props.filterKey !== prevProps.filterKey) {
      listHandler.current.recomputeGridSize();
    }

    if (
      props.focusedTime &&
      props.filteredNodes?.length !== prevProps.filteredNodes?.length
    ) {
      window.requestAnimationFrame(() => {
        scrollToTimeHandler(props.focusedTime);
      });
    }
  }, []);

  const listElHandler = useCallback(() => {
    // eslint-disable-next-line react/no-find-dom-node
    const el = listHandler.current && ReactDOM.findDOMNode(listHandler.current);
    if (!(el instanceof HTMLElement)) {
      return null;
    }
    return el;
  }, []);

  const didResizeHandler = useCallback(() => {
    cacheHandler.clearAll();
    forceUpdateHandler();
  }, []);

  const attachScrollToBottomObserverHandler = useCallback(() => {
    const el = listElHandler;
    if (!el) {
      console.warn(`No container, LogsScrollingTable must render listEl`);
      return;
    }

    let lastHeight: string | null = null;

    scrollToBottomObserverHandler = new MutationObserver(() => {
      const rowgroupEl = el.querySelector('[role=rowgroup]') as HTMLElement;
      if (!rowgroupEl) {
        lastHeight = null;
        return;
      }
      if (rowgroupEl.style.height === lastHeight) {
        return;
      }
      if (!isAtBottomOrZeroHandler) {
        return;
      }

      lastHeight = rowgroupEl.style.height;
      el.scrollTop = el.scrollHeight - el.clientHeight;
    });

    scrollToBottomObserverHandler.observe(el, {
      attributes: true,
      subtree: true,
    });
  }, []);

  const onScrollHandler = useCallback(({scrollTop, scrollHeight, clientHeight}: ScrollParams) => {
    const atTopAndStarting = scrollTop === 0 && scrollHeight <= clientHeight;

    // Note: The distance to the bottom can go negative if you scroll into the padding at the bottom of the list.
    // react-virtualized seems to be faking these numbers (they're different than what you get if you inspect the el)
    const distanceToBottom = scrollHeight - clientHeight - scrollTop;
    const atBottom = distanceToBottom < 5;

    isAtBottomOrZeroHandler = atTopAndStarting || atBottom;
  }, []);

  const scrollToTimeHandler = useCallback((ms: number) => {
    if (!props.filteredNodes || !listHandler.current) {
      return;
    }

    // Stop the table from attempting to return to the bottom-of-feed
    // if more logs arrive.
    isAtBottomOrZeroHandler = false;

    // Find the row immediately at or after the provided timestamp
    const target: {index: number; alignment: 'center'} = {
      index: props.filteredNodes.findIndex((n) => Number(n.timestamp) >= ms),
      alignment: 'center',
    };
    if (target.index === -1) {
      target.index = props.filteredNodes.length - 1;
    }

    // Move to the offset. For some reason, this takes multiple iterations but not multiple renders.
    // It seems react-virtualized may be using default row height for rows more than X rows away and
    // the number gets more accurate as we scroll, which is very annoying.
    let offset = 0;
    let iterations = 0;
    while (offset !== listHandler.current.getOffsetForRow(target)) {
      offset = listHandler.current.getOffsetForRow(target);
      listHandler.current.scrollToPosition(offset);
      iterations += 1;
      if (iterations > 20) {
        break;
      }
    }
  }, []);

  const rowRendererHandler = useCallback(({parent, index, style}: ListRowProps) => {
    if (!props.filteredNodes) {
      return;
    }
    const node = props.filteredNodes[index];
    const focusedTimeMatch = Number(node.timestamp) === props.focusedTime;
    const textMatch = !!props.textMatchNodes?.includes(node);

    const metadata = props.metadata;
    if (!node) {
      return <span />;
    }
    const isLastRow = index === props.filteredNodes.length - 1;
    const lastRowStyles = isLastRow
      ? {
          borderBottom: `1px solid ${Colors.Gray100}`,
        }
      : {};

    return (
      <CellMeasurer cache={cacheHandler} index={index} parent={parent} key={node.clientsideKey}>
        {node.__typename === 'LogMessageEvent' ? (
          <Unstructured
            node={node}
            metadata={metadata}
            style={{...style, width: props.width, ...lastRowStyles}}
            highlighted={textMatch || focusedTimeMatch}
          />
        ) : (
          <Structured
            node={node}
            metadata={metadata}
            style={{...style, width: props.width, ...lastRowStyles}}
            highlighted={textMatch || focusedTimeMatch}
          />
        )}
      </CellMeasurer>
    );
  }, []);

  const noContentRendererHandler = useCallback(() => {
    if (props.filteredNodes) {
      return <NonIdealState icon="no-results" title="No logs to display" />;
    }
    return <span />;
  }, []);

  const list = useRef(React.createRef<List>());

  const cache = useRef(new CellMeasurerCache({
    defaultHeight: 30,
    fixedWidth: true,
    keyMapper: (rowIndex) =>
      props.filteredNodes ? props.filteredNodes[rowIndex].clientsideKey : '',
  }));

  const isAtBottomOrZero = useRef(true);
  const scrollToBottomObserver = useRef(null);
  return (
    <div>
      {loading ? (
        <ListEmptyState>
          <NonIdealState icon="spinner" title="Fetching logs..." />
        </ListEmptyState>
      ) : null}
      <List
        ref={listHandler}
        deferredMeasurementCache={cacheHandler}
        rowCount={filteredNodes?.length || 0}
        noContentRenderer={noContentRendererHandler}
        rowHeight={cacheHandler.rowHeight}
        rowRenderer={rowRendererHandler}
        width={width}
        height={height}
        overscanRowCount={10}
        style={{paddingBottom: LOGS_PADDING_BOTTOM}}
        onScroll={onScrollHandler}
      />
    </div>
  );
};

const AutoSizer = (
  props: {
    children: (size: {width: number; height: number}) => React.ReactNode;
  }
) => {
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    measureHandler();

    // eslint-disable-next-line react/no-find-dom-node
    const el = ReactDOM.findDOMNode(this);
    if (el && el instanceof HTMLElement && 'ResizeObserver' in window) {
      const RO = window['ResizeObserver'] as any;
      resizeObserverHandler = new RO((entries: any) => {
        setWidth(entries[0].contentRect.width);
        setHeight(entries[0].contentRect.height);
      });
      resizeObserverHandler.observe(el);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (resizeObserverHandler) {
        resizeObserverHandler.disconnect();
      }
    };
  });

  useEffect(() => {
    measureHandler();
  }, []);

  const measureHandler = useCallback(() => {
    // eslint-disable-next-line react/no-find-dom-node
    const el = ReactDOM.findDOMNode(this);
    if (!el || !(el instanceof HTMLElement)) {
      return;
    }
    if (el.clientWidth !== width || el.clientHeight !== height) {
      setWidth(el.clientWidth);
      setHeight(el.clientHeight);
    }
  }, []);

  const resizeObserver = useRef(null);
  return <div style={{width: '100%', height: '100%'}}>{props.children(stateHandler)}</div>;
};

const ListEmptyState = styled.div`
  background-color: rgba(255, 255, 255, 0.7);
  z-index: 100;
  position: absolute;
  width: 100%;
  height: calc(100% - 50px);
`;

import {Colors, Group, Icon, Spinner, FontFamily} from '@dagster-io/ui';
import Ansi from 'ansi-to-react';
import * as React from 'react';
import styled, {createGlobalStyle} from 'styled-components/macro';

import { useRef, useEffect, useCallback } from 'react';

const MAX_STREAMING_LOG_BYTES = 5242880; // 5 MB
const TRUNCATE_PREFIX = '\u001b[33m...logs truncated...\u001b[39m\n';
const SCROLLER_LINK_TIMEOUT_MS = 3000;

export const RawLogContent: React.FC<{
  logData: string | null;
  isLoading: boolean;
  isVisible: boolean;
  downloadUrl?: string | null;
  location?: string;
}> = React.memo(({logData, location, isLoading, isVisible, downloadUrl}) => {
  const contentContainer = React.useRef<ScrollContainer | null>(null);
  const timer = React.useRef<number>();
  const [showScrollToTop, setShowScrollToTop] = React.useState(false);
  const scrollToTop = () => {
    contentContainer.current && contentContainer.current.scrollToTop();
  };
  const cancelHideWarning = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = 0;
    }
  };
  const hideWarning = () => {
    setShowScrollToTop(false);
    cancelHideWarning();
  };
  const scheduleHideWarning = () => {
    timer.current = window.setTimeout(hideWarning, SCROLLER_LINK_TIMEOUT_MS);
  };
  const onScrollUp = (position: number) => {
    cancelHideWarning();

    if (!position) {
      hideWarning();
    } else {
      setShowScrollToTop(true);
      scheduleHideWarning();
    }
  };
  let content = logData;
  const isTruncated = shouldTruncate(content);

  if (content && isTruncated) {
    const nextLine = content.indexOf('\n') + 1;
    const truncated = nextLine < content.length ? content.slice(nextLine) : content;
    content = TRUNCATE_PREFIX + truncated;
  }
  const warning = isTruncated ? (
    <FileWarning>
      <Group direction="row" spacing={8} alignItems="center">
        <Icon name="warning" color={Colors.Yellow500} />
        <div>
          This log has exceeded the 5MB limit.{' '}
          {downloadUrl ? (
            <a href={downloadUrl} download>
              Download the full log file
            </a>
          ) : null}
          .
        </div>
      </Group>
    </FileWarning>
  ) : null;

  return (
    <>
      <FileContainer isVisible={isVisible}>
        {showScrollToTop ? (
          <ScrollToast>
            <ScrollToTop
              onClick={scrollToTop}
              onMouseOver={cancelHideWarning}
              onMouseOut={scheduleHideWarning}
            >
              <Group direction="row" spacing={8} alignItems="center">
                <Icon name="arrow_upward" color={Colors.White} />
                Scroll to top
              </Group>
            </ScrollToTop>
          </ScrollToast>
        ) : null}
        <FileContent>
          {warning}
          <RelativeContainer>
            <LogContent
              isSelected={true}
              content={logData}
              onScrollUp={onScrollUp}
              onScrollDown={hideWarning}
              ref={contentContainer}
            />
          </RelativeContainer>
        </FileContent>
        {isLoading ? (
          <LoadingContainer>
            <Spinner purpose="page" />
          </LoadingContainer>
        ) : null}
      </FileContainer>
      {location ? <FileFooter isVisible={isVisible}>{location}</FileFooter> : null}
    </>
  );
});

const shouldTruncate = (content: string | null | undefined) => {
  if (!content) {
    return false;
  }
  const encoder = new TextEncoder();
  return encoder.encode(content).length >= MAX_STREAMING_LOG_BYTES;
};

interface IScrollContainerProps {
  content: string | null | undefined;
  isSelected?: boolean;
  className?: string;
  onScrollUp?: (position: number) => void;
  onScrollDown?: (position: number) => void;
}

const ScrollContainer = (props: IScrollContainerProps) => {
  const {
    onScrollUp,
    onScrollDown,
    content,
    className
  } = props;

  useEffect(() => {
    scrollToBottomHandler();
    if (containerHandler.current) {
      containerHandler.current.focus();
      containerHandler.current.addEventListener('scroll', onScrollHandler);
    }
  }, []);

  useEffect(() => {
    if (shouldScroll) {
      scrollToBottomHandler();
    }
    if (props.isSelected && !_props.isSelected) {
      containerHandler.current && containerHandler.current.focus();
    }
  }, []);

  const getSnapshotBeforeUpdateHandler = useCallback(() => {
    if (!containerHandler.current) {
      return false;
    }
    const {scrollHeight, scrollTop, offsetHeight} = containerHandler.current;
    const shouldScroll = offsetHeight + scrollTop >= scrollHeight;
    return shouldScroll;
  }, []);

  const onScrollHandler = useCallback(() => {
    if (!containerHandler.current || !props.isSelected) {
      return;
    }

    const {scrollHeight, scrollTop, offsetHeight} = containerHandler.current;
    const position = scrollTop / (scrollHeight - offsetHeight);
    if (containerHandler.current.scrollTop < lastScrollHandler) {
      onScrollUp && onScrollUp(position);
    } else {
      onScrollDown && onScrollDown(position);
    }
    lastScrollHandler = containerHandler.current.scrollTop;
  }, []);

  const focusHandler = useCallback(() => {
    const node = containerHandler.current;
    if (!node) {
      return;
    }

    node.focus();
  }, []);

  const scrollToBottomHandler = useCallback(() => {
    const node = containerHandler.current;
    if (!node) {
      return;
    }

    node.scrollTop = node.scrollHeight - node.offsetHeight;
  }, []);

  const scrollToTopHandler = useCallback(() => {
    const node = containerHandler.current;
    if (!node) {
      return;
    }

    node.scrollTop = 0;
    node.focus();
  }, []);

  const container = useRef(React.createRef<HTMLDivElement>());
  const lastScroll = useRef(0);
  if (!content) {
    return (
      <div className={className} ref={containerHandler}>
        <ContentContainer style={{justifyContent: 'center', alignItems: 'center'}}>
          {content == null ? 'No log file available' : 'No output'}
        </ContentContainer>
      </div>
    );
  }

  return (
    <div className={className} style={{outline: 'none'}} ref={containerHandler} tabIndex={0}>
      <ContentContainer>
        <LineNumbers content={content} />
        <Content>
          <SolarizedColors />
          <Ansi linkify={false} useClasses>
            {content}
          </Ansi>
        </Content>
      </ContentContainer>
    </div>
  );
};

const LineNumbers = (props: IScrollContainerProps) => {
  const {content} = props;
  if (!content) {
    return null;
  }
  const matches = content.match(/\n/g);
  const count = matches ? matches.length : 0;
  return (
    <LineNumberContainer>
      {Array.from(Array(count), (_, i) => (
        <div key={i}>{String(i + 1)}</div>
      ))}
    </LineNumberContainer>
  );
};

const Content = styled.div`
  padding: 10px;
  background-color: ${Colors.Gray900};
`;
const LineNumberContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  border-right: 1px solid #5c7080;
  padding: 10px 10px 10px 20px;
  margin-right: 5px;
  background-color: ${Colors.Gray900};
  opacity: 0.8;
  color: #858585;
  min-height: 100%;
`;
const SolarizedColors = createGlobalStyle`
  .ansi-black {
    color: #586e75;
  }
  .ansi-red {
    color: #dc322f;
  }
  .ansi-green {
    color: #859900;
  }
  .ansi-yellow {
    color: #b58900;
  }
  .ansi-blue {
    color: #268bd2;
  }
  .ansi-magenta {
    color: #d33682;
  }
  .ansi-cyan {
    color: #2aa198;
  }
  .ansi-white {
    color: #eee8d5;
  }
`;
const ContentContainer = styled.div`
  display: flex;
  flex-direction: row;
  min-height: 100%;
  background-color: ${Colors.Gray900};
`;
const FileContainer = styled.div`
  flex: 1;
  height: 100%;
  position: relative;
  &:first-child {
    border-right: 0.5px solid #5c7080;
  }
  display: flex;
  flex-direction: column;
  ${({isVisible}: {isVisible: boolean}) => (isVisible ? null : 'display: none;')}
`;
const FileFooter = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 30px;
  background-color: ${Colors.Gray900};
  border-top: 0.5px solid #5c7080;
  color: #aaaaaa;
  padding: 2px 5px;
  font-size: 0.85em;
  ${({isVisible}: {isVisible: boolean}) => (isVisible ? null : 'display: none;')}
`;

const FileContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;
const RelativeContainer = styled.div`
  flex: 1;
  position: relative;
`;
const LogContent = styled(ScrollContainer)`
  color: #eeeeee;
  font-family: ${FontFamily.monospace};
  font-size: 16px;
  white-space: pre;
  overflow: auto;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
`;
const LoadingContainer = styled.div`
  display: flex;
  justifycontent: center;
  alignitems: center;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  backgroundcolor: ${Colors.Gray800};
  opacity: 0.3;
`;

const ScrollToast = styled.div`
  position: absolute;
  height: 30px;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: flex-start;
  z-index: 1;
`;
const ScrollToTop = styled.div`
  background-color: black;
  padding: 10px 20px;
  border-bottom-right-radius: 5px;
  border-bottom-left-radius: 5px;
  color: white;
  border-bottom: 0.5px solid #5c7080;
  border-left: 0.5px solid #5c7080;
  border-right: 0.5px solid #5c7080;
  cursor: pointer;
`;

const FileWarning = styled.div`
  background-color: #fffae3;
  padding: 10px 20px;
  margin: 20px 70px;
  border-radius: 5px;
`;

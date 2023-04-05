import {Colors} from '@dagster-io/ui';
import * as React from 'react';
import styled from 'styled-components/macro';

import {showCustomAlert} from '../app/CustomAlertProvider';

import { useState, useRef, useEffect, useCallback } from 'react';

const OverflowFade = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 40px;
  user-select: none;
  pointer-events: none;
  background: linear-gradient(to bottom, rgba(245, 248, 250, 0) 0%, rgba(245, 248, 250, 255) 100%);
`;

const OverflowButtonContainer = styled.div`
  position: absolute;
  bottom: 6px;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: row;
  justify-content: center;
`;

const OverflowButton = styled.button`
  border: 0;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  font-weight: 500;
  background: rgba(100, 100, 100, 0.7);
  border-radius: 4px;
  line-height: 32px;
  padding: 0 12px;
  color: ${Colors.White};
  &:hover {
    background: rgba(100, 100, 100, 0.85);
  }

  &:focus,
  &:active {
    outline: none;
  }

  &:active {
    background: rgba(0, 0, 0, 0.7);
  }
`;

const CellTruncationProvider = props => {
  const {
    onExpand
  } = props;

  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    detectOverflowHandler();
  }, []);

  useEffect(() => {
    detectOverflowHandler();
  }, []);

  const detectOverflowHandler = useCallback(() => {
    const child =
      contentContainerRefHandler.current && contentContainerRefHandler.current.firstElementChild;

    if (!child) {
      return;
    }

    const isOverflowing =
      typeof props.style.height === 'number' && child.scrollHeight > props.style.height;
    if (isOverflowing !== isOverflowing) {
      setIsOverflowing(isOverflowing);
    }
  }, []);

  const defaultExpandHandler = useCallback(() => {
    const message =
      contentContainerRefHandler.current && contentContainerRefHandler.current.textContent;
    message &&
      showCustomAlert({
        body: <div style={{whiteSpace: 'pre-wrap'}}>{message}</div>,
      });
  }, []);

  const onViewHandler = useCallback(() => {
    onExpand ? onExpand() : defaultExpandHandler();
  }, []);

  const contentContainerRef = useRef(React.createRef());
  const style = {...props.style, overflow: 'hidden'};

  return (
    <div style={style}>
      <div ref={contentContainerRefHandler}>{props.children}</div>
      {(isOverflowing || props.forceExpandability) && (
        <>
          <OverflowFade />
          <OverflowButtonContainer>
            <OverflowButton onClick={onViewHandler}>View full message</OverflowButton>
          </OverflowButtonContainer>
        </>
      )}
    </div>
  );
};

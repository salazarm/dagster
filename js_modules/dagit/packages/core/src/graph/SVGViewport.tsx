import {Box, Colors, Icon, IconWrapper, Slider} from '@dagster-io/ui';
import animate from 'amator';
import * as React from 'react';
import ReactDOM from 'react-dom';
import {MemoryRouter} from 'react-router-dom';
import styled from 'styled-components/macro';

import {IBounds} from './common';
import {makeSVGPortable} from './makeSVGPortable';

import { useRef, useState, useEffect, useCallback } from 'react';

export interface SVGViewportInteractor {
  onMouseDown(viewport: SVGViewport, event: React.MouseEvent<HTMLDivElement>): void;
  onWheel(viewport: SVGViewport, event: WheelEvent): void;
  render?(viewport: SVGViewport): React.ReactElement<any> | null;
}

interface SVGViewportProps {
  graphWidth: number;
  graphHeight: number;
  graphHasNoMinimumZoom?: boolean;
  interactor: SVGViewportInteractor;
  maxZoom: number;
  maxAutocenterZoom: number;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onArrowKeyDown?: (
    event: React.KeyboardEvent<HTMLDivElement>,
    dir: 'left' | 'up' | 'right' | 'down',
  ) => void;
  children: (
    state: SVGViewportState,
    bounds: {top: number; left: number; bottom: number; right: number},
  ) => React.ReactNode;
}

interface SVGViewportState {
  x: number;
  y: number;
  scale: number;
  minScale: number;
}

interface Point {
  x: number;
  y: number;
}

export const DETAIL_ZOOM = 0.75;
const DEFAULT_ZOOM = 0.75;
const DEFAULT_MAX_AUTOCENTER_ZOOM = 1;
const DEFAULT_MIN_ZOOM = 0.17;

const BUTTON_INCREMENT = 0.05;

const PanAndZoomInteractor: SVGViewportInteractor = {
  onMouseDown(viewport: SVGViewport, event: React.MouseEvent<HTMLDivElement>) {
    if (viewport._animation) {
      viewport._animation.cancel();
    }

    if (!viewport.element.current) {
      return;
    }

    if (event.target instanceof HTMLElement && event.target.closest('#zoom-slider-container')) {
      return;
    }

    const start = viewport.getOffsetXY(event);
    if (!start) {
      return;
    }

    let lastX: number = start.x;
    let lastY: number = start.y;
    const travel = {x: 0, y: 0};

    const onMove = (e: MouseEvent) => {
      const offset = viewport.getOffsetXY(e);
      if (!offset) {
        return;
      }

      const delta = {x: offset.x - lastX, y: offset.y - lastY};
      viewport.setState({
        x: viewport.state.x + delta.x,
        y: viewport.state.y + delta.y,
      });
      travel.x += Math.abs(delta.x);
      travel.y += Math.abs(delta.y);
      lastX = offset.x;
      lastY = offset.y;
    };

    const onCancelClick = (e: MouseEvent) => {
      // If you press, drag, and release the mouse we don't want it to trigger a click
      // beneath your cursor. onClick's within the DAG should only fire if you did not
      // drag the mouse.
      if (Math.sqrt(travel.x + travel.y) > 5) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setTimeout(() => {
        document.removeEventListener('click', onCancelClick, {capture: true});
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('click', onCancelClick, {capture: true});
  },

  onWheel(viewport: SVGViewport, event: WheelEvent) {
    const cursorPosition = viewport.getOffsetXY(event);
    if (!cursorPosition) {
      return;
    }

    if (event.altKey || event.shiftKey) {
      viewport.shiftXY(-event.deltaX, -event.deltaY);
    } else {
      const targetScale = viewport.state.scale * (1 - event.deltaY * 0.0025);
      const scale = Math.max(viewport.getMinZoom(), Math.min(viewport.getMaxZoom(), targetScale));
      viewport.adjustZoomRelativeToScreenPoint(scale, cursorPosition);
    }
  },

  render(viewport: SVGViewport) {
    return (
      <ZoomSliderContainer id="zoom-slider-container">
        <Box margin={{bottom: 8}}>
          <IconButton
            onClick={() => {
              const x = viewport.element.current!.clientWidth / 2;
              const y = viewport.element.current!.clientHeight / 2;
              const scale = Math.min(
                viewport.getMaxZoom(),
                viewport.state.scale + BUTTON_INCREMENT,
              );
              const adjusted = Math.round((scale + Number.EPSILON) * 100) / 100;
              viewport.adjustZoomRelativeToScreenPoint(adjusted, {x, y});
            }}
          >
            <Icon size={24} name="zoom_in" color={Colors.Gray300} />
          </IconButton>
        </Box>
        <Slider
          vertical
          min={viewport.getMinZoom()}
          max={viewport.getMaxZoom()}
          stepSize={0.001}
          value={viewport.state.scale}
          labelRenderer={false}
          onChange={(scale: number) => {
            const x = viewport.element.current!.clientWidth / 2;
            const y = viewport.element.current!.clientHeight / 2;
            viewport.adjustZoomRelativeToScreenPoint(scale, {x, y});
          }}
        />
        <Box margin={{top: 8}}>
          <IconButton
            onClick={() => {
              const x = viewport.element.current!.clientWidth / 2;
              const y = viewport.element.current!.clientHeight / 2;
              const scale = Math.max(
                viewport.getMinZoom(),
                viewport.state.scale - BUTTON_INCREMENT,
              );
              viewport.adjustZoomRelativeToScreenPoint(scale, {x, y});
            }}
          >
            <Icon size={24} name="zoom_out" color={Colors.Gray300} />
          </IconButton>
        </Box>
        <Box margin={{top: 8}}>
          <IconButton
            onClick={() => {
              viewport.onExportToSVG();
            }}
          >
            <Icon size={24} name="download_for_offline" color={Colors.Gray300} />
          </IconButton>
        </Box>
      </ZoomSliderContainer>
    );
  },
};

const IconButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  position: relative;
  left: -4px;

  :focus {
    outline: none;
  }

  ${IconWrapper} {
    transition: background 100ms;
  }

  :focus ${IconWrapper}, :hover ${IconWrapper}, :active ${IconWrapper} {
    background-color: ${Colors.Blue500};
  }
`;

const NoneInteractor: SVGViewportInteractor = {
  onMouseDown(_viewport: SVGViewport, event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
  },

  onWheel() {
    return;
  },

  render() {
    return <span />;
  },
};

const SVGViewport = inputProps => {
  const props = {
    maxZoom: DEFAULT_ZOOM,
    maxAutocenterZoom: DEFAULT_MAX_AUTOCENTER_ZOOM,
    ...inputProps
  };

  const [x, setX] = useState();
  const [y, setY] = useState();
  const [scale, setScale] = useState();
  const [scale, setScale] = useState();
  const [x, setX] = useState();
  const [y, setY] = useState();
  const [scale, setScale] = useState();

  const {
    children,
    onClick,
    interactor
  } = props;

  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [scale, setScale] = useState(DETAIL_ZOOM);
  const [minScale, setMinScale] = useState(0);

  useEffect(() => {
    autocenterHandler();

    // The wheel event cannot be prevented via the `onWheel` handler.
    document.addEventListener('wheel', onWheelHandler, {passive: false});

    // The op/asset graphs clip rendered nodes to the visible region, so changes to the
    // size of the viewport need to cause re-renders. Otherwise you expand the window
    // and see nothing in the newly visible areas.
    if (
      elementHandler.current &&
      elementHandler.current instanceof HTMLElement &&
      'ResizeObserver' in window
    ) {
      const RO = window['ResizeObserver'] as any;
      resizeObserverHandler = new RO(() => {
        window.requestAnimationFrame(() => {
          forceUpdateHandler();
        });
      });
      resizeObserverHandler.observe(elementHandler.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      document.removeEventListener('wheel', onWheelHandler);
      resizeObserverHandler?.disconnect();
    };
  });

  const onWheelHandler = useCallback((e: WheelEvent) => {
    const container = elementHandler.current;
    // If the wheel event occurs within our SVG container, prevent it from zooming
    // the document, and handle it with the interactor.
    if (container && e.target instanceof Node && container.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      props.interactor.onWheel(this, e);
    }
  }, []);

  const cancelAnimationsHandler = useCallback(() => {
    if (_animationHandler) {
      _animationHandler.cancel();
    }
  }, []);

  const focusHandler = useCallback(() => {
    elementHandler.current?.focus();
  }, []);

  const scaleForSVGBoundsHandler = useCallback((svgRegionWidth: number, svgRegionHeight: number) => {
    const el = elementHandler.current;
    if (!el) {
      return 1;
    }
    const ownerRect = {width: el.clientWidth, height: el.clientHeight};

    const dw = ownerRect.width / svgRegionWidth;
    const dh = ownerRect.height / svgRegionHeight;
    return Math.min(dw, dh);
  }, []);

  const autocenterHandler = useCallback((animate = false, scale?: number) => {
    const el = elementHandler.current!;
    const ownerRect = {width: el.clientWidth, height: el.clientHeight};
    const desiredScale = scaleForSVGBoundsHandler(props.graphWidth, props.graphHeight);
    const minScale = getMinZoomHandler();
    const boundedScale =
      scale || Math.max(Math.min(desiredScale, props.maxAutocenterZoom), minScale);

    if (
      scale < boundedScale &&
      desiredScale !== boundedScale &&
      boundedScale === minScale
    ) {
      // If the user is zoomed out past where they're going to land, AND where they're going to land
      // is not a view of the entire DAG but instead a view of some zoomed section, autocentering is
      // undesirable and should do nothing.
      return;
    }
    const target = {
      x: -(props.graphWidth / 2) * boundedScale + ownerRect.width / 2,
      y: -(props.graphHeight / 2) * boundedScale + ownerRect.height / 2,
      scale: boundedScale,
    };

    if (animate) {
      smoothZoomHandler(target);
    } else {
      setStateHandler(Object.assign(target, {minScale: boundedScale}));
    }
  }, []);

  const screenToSVGCoordsHandler = useCallback(({x, y}: Point) => {
    const el = elementHandler.current!;
    const {width, height} = el.getBoundingClientRect();
    return {
      x: (-(x - width / 2) + x - width / 2) / scale,
      y: (-(y - height / 2) + y - height / 2) / scale,
    };
  }, []);

  const getOffsetXYHandler = useCallback((e: MouseEvent | React.MouseEvent) => {
    const el = elementHandler.current;
    if (!el) {
      return null;
    }
    const ownerRect = el.getBoundingClientRect();
    return {x: e.clientX - ownerRect.left, y: e.clientY - ownerRect.top};
  }, []);

  const shiftXYHandler = useCallback((dx: number, dy: number) => {
    setX(x + dx);
    setY(y + dy);
    setScale(scale);
  }, []);

  const adjustZoomRelativeToScreenPointHandler = useCallback((nextScale: number, point: Point) => {
    const centerSVGCoord = screenToSVGCoordsHandler(point);
    let {x, y} = stateHandler;
    x = x + (centerSVGCoord.x * scale - centerSVGCoord.x * nextScale);
    y = y + (centerSVGCoord.y * scale - centerSVGCoord.y * nextScale);
    setX(x);
    setY(y);
    setScale(nextScale);
  }, []);

  const zoomToSVGBoxHandler = useCallback((box: IBounds, animate: boolean, newScale = this.state.scale) => {
    zoomToSVGCoordsHandler(box.x + box.width / 2, box.y + box.height / 2, animate, newScale);
  }, []);

  const zoomToSVGCoordsHandler = useCallback((x: number, y: number, animate: boolean, scale = this.state.scale) => {
    const el = elementHandler.current!;
    const boundedScale = Math.max(Math.min(getMaxZoomHandler(), scale), getMinZoomHandler());

    const ownerRect = el.getBoundingClientRect();
    x = -x * boundedScale + ownerRect.width / 2;
    y = -y * boundedScale + ownerRect.height / 2;

    if (animate) {
      smoothZoomHandler({x, y, scale: boundedScale});
    } else {
      setX(x);
      setY(y);
      setScale(boundedScale);
    }
  }, []);

  const smoothZoomHandler = useCallback((to: {x: number; y: number; scale: number}) => {
    const from = {scale: scale, x: x, y: y};

    if (_animationHandler) {
      _animationHandler.cancel();
    }

    _animationHandler = animate(from, to, {
      step: (v: any) => {
        setX(v.x);
        setY(v.y);
        setScale(v.scale);
      },
      done: () => {
        setStateHandler(to);
        _animationHandler = null;
      },
    });
  }, []);

  const getMinZoomHandler = useCallback(() => {
    if (props.graphHasNoMinimumZoom) {
      return Math.min(
        DEFAULT_MIN_ZOOM,
        scaleForSVGBoundsHandler(props.graphWidth, props.graphHeight),
      );
    }
    return DEFAULT_MIN_ZOOM;
  }, []);

  const getMaxZoomHandler = useCallback(() => {
    return props.maxZoom;
  }, []);

  const getViewportHandler = useCallback(() => {
    let viewport = {top: 0, left: 0, right: 0, bottom: 0};
    if (elementHandler.current) {
      const el = elementHandler.current!;
      const {width, height} = el.getBoundingClientRect();
      viewport = {
        left: -x / scale,
        top: -y / scale,
        right: (-x + width) / scale,
        bottom: (-y + height) / scale,
      };
    }
    return viewport;
  }, []);

  const onZoomAndCenterHandler = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const offsetXY = getOffsetXYHandler(event);
    if (!offsetXY) {
      return;
    }
    const offset = screenToSVGCoordsHandler(offsetXY);
    const maxZoom = props.maxZoom || DEFAULT_ZOOM;

    if (Math.abs(maxZoom - scale) < 0.01) {
      zoomToSVGCoordsHandler(offset.x, offset.y, true, minScale);
    } else {
      zoomToSVGCoordsHandler(offset.x, offset.y, true, maxZoom);
    }
  }, []);

  const onKeyDownHandler = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target && (e.target as HTMLElement).nodeName === 'INPUT') {
      return;
    }

    const dir = ({
      ArrowLeft: 'left',
      ArrowUp: 'up',
      ArrowRight: 'right',
      ArrowDown: 'down',
    } as const)[e.code];
    if (!dir) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    props.onArrowKeyDown?.(e, dir);
  }, []);

  const onDoubleClickHandler = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    // Don't allow double-click events on the zoom slider to trigger this.
    if (event.target instanceof HTMLElement && event.target.closest('#zoom-slider-container')) {
      return;
    }
    props.onDoubleClick && props.onDoubleClick(event);
  }, []);

  const onExportToSVGHandler = useCallback(async () => {
    const unclippedViewport = {
      top: 0,
      left: 0,
      right: props.graphWidth,
      bottom: props.graphHeight,
    };

    const div = document.createElement('div');
    document.getElementById('root')!.appendChild(div);
    ReactDOM.render(
      <MemoryRouter>{props.children(stateHandler, unclippedViewport)}</MemoryRouter>,
      div,
    );
    const svg = div.querySelector('svg') as SVGElement;
    await makeSVGPortable(svg);

    const text = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([text], {type: 'image/svg+xml'});
    const a = document.createElement('a');
    a.setAttribute(
      'download',
      `${document.title.replace(/[: \/]/g, '_').replace(/__+/g, '_')}.svg`,
    );
    a.setAttribute('href', URL.createObjectURL(blob));
    a.click();
    div.remove();
  }, []);

  const element = useRef(React.createRef());
  const panzoom = useRef(null);
  const _animation = useRef(null);
  const _lastWheelTime = useRef(0);
  const _lastWheelDir = useRef(0);
  const resizeObserver = useRef(null);
  const dotsize = Math.max(7, 30 * scale);

  return (
    <div
      ref={elementHandler}
      style={Object.assign({}, SVGViewportStyles, {
        backgroundPosition: `${x}px ${y}px`,
        backgroundSize: `${dotsize}px`,
      })}
      onMouseDown={(e) => interactor.onMouseDown(this, e)}
      onDoubleClick={onDoubleClickHandler}
      onKeyDown={onKeyDownHandler}
      onDragStart={(e) => e.preventDefault()}
      onClick={onClick}
      tabIndex={-1}
    >
      <div
        style={{
          transformOrigin: `top left`,
          transform: `matrix(${scale}, 0, 0, ${scale}, ${x}, ${y})`,
        }}
      >
        {children(stateHandler, getViewportHandler())}
      </div>
      {interactor.render && interactor.render(this)}
    </div>
  );
};

SVGViewport.Interactors = {
  PanAndZoom: PanAndZoomInteractor,
  None: NoneInteractor,
};

/*
BG: Not using styled-components here because I need a `ref` to an actual DOM element.
Styled-component with a ref returns a React component we need to findDOMNode to use.
*/
const SVGViewportStyles: React.CSSProperties = {
  width: '100%',
  height: '100%',
  position: 'relative',
  overflow: 'hidden',
  userSelect: 'none',
  outline: 'none',
  background: `url("data:image/svg+xml;utf8,<svg width='30px' height='30px' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'><circle fill='rgba(236, 236, 236, 1)' cx='5' cy='5' r='5' /></svg>") repeat`,
};

const ZoomSliderContainer = styled.div`
  position: absolute;
  bottom: 0;
  right: 0;
  width: 30px;
  padding: 10px 8px;
  padding-bottom: 0;
  background: rgba(245, 248, 250, 0.4);
`;

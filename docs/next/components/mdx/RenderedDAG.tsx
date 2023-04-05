import animate from 'amator';
import React, { useRef, useState, useCallback, useEffect } from 'react';

const MAX_WIDTH = 500;
const MAX_HOVER_WIDTH = (MAX_WIDTH / 40.0) * 40.5;

// Tweaked version of the website component
// See https://github.com/dagster-io/dagster-website/blob/master/components/RenderedDAG.tsx

export const RenderedDAG: React.FC<{
  svgSrc: string;
  mobileImgSrc: string;
}> = ({svgSrc}) => {
  const [focus, setFocus] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const [content, setContent] = React.useState('');

  React.useEffect(() => {
    const load = async () => {
      const result = await fetch(svgSrc);
      const text = await result.text();
      setContent(text);
    };
    load();
  }, [svgSrc]);

  return (
    <div
      className="text-black hidden lg:block"
      style={{
        minHeight: 400,
        width: '40.5%',
        maxWidth: MAX_HOVER_WIDTH,
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          lineHeight: 1.1,
          position: 'absolute',
          bottom: 0,
          top: 0,
          right: 0,
          paddingLeft: focus ? 0 : hover ? 5 : 15,
          width: focus ? '100%' : '40.5%',
          maxWidth: focus ? '100%' : MAX_HOVER_WIDTH,
          left: 'unset',
          cursor: focus ? 'grab' : 'zoom-in',
          zIndex: focus || hover ? 2 : 1,
          transition:
            'width 300ms ease-in-out, max-width 300ms ease-in-out, padding-left 300ms ease-in-out, left 300ms ease-in-out',
        }}
      >
        {focus && (
          <div
            onClick={() => setFocus(false)}
            className="absolute top-4 left-4 flex gap-1 bg-white border border-gray-200 hover:bg-gray-100 transition text-black py-2 px-4 z-50 rounded-full cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="20px"
              viewBox="0 0 24 24"
              width="20px"
              fill="#000"
            >
              <path d="M0 0h24v24H0z" fill="none"></path>
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>
            </svg>
            Close
          </div>
        )}

        {content ? (
          <SVGViewport
            graphWidth={Number(content.match(/ width=\"([0-9\.]+)\"/)![1])}
            graphHeight={Number(content.match(/ height=\"([0-9\.]+)\"/)![1])}
            maxZoom={1.2}
            maxAutocenterZoom={1.0}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            content={content}
          />
        ) : (
          <div style={SVGViewportStyles} />
        )}
      </div>
    </div>
  );
};

interface SVGViewportProps {
  content: string;
  graphWidth: number;
  graphHeight: number;
  maxZoom: number;
  maxAutocenterZoom: number;
  onFocus: () => void;
  onBlur: () => void;
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

const MIN_ZOOM = 0.17;

const SVGViewport = props => {
  const [x, setX] = useState();
  const [y, setY] = useState();
  const [scale, setScale] = useState();
  const [scale, setScale] = useState();
  const [x, setX] = useState();
  const [y, setY] = useState();
  const [scale, setScale] = useState();
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [scale, setScale] = useState(0.75);
  const [minScale, setMinScale] = useState(0);

  useEffect(() => {
    autocenterHandler();

    // The op/asset graphs clip rendered nodes to the visible region, so changes to the
    // size of the viewport need to cause re-renders. Otherwise you expand the window
    // and see nothing in the newly visible areas.
    if (
      elementHandler.current &&
      elementHandler.current instanceof HTMLElement &&
      'ResizeObserver' in window
    ) {
      const RO = (window as any)['ResizeObserver'] as any;
      resizeObserverHandler = new RO(() => {
        autocenterHandler(false);
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

  const onMouseDownHandler = useCallback((viewport: SVGViewport, event: React.MouseEvent<HTMLDivElement>) => {
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
      lastX = offset.x;
      lastY = offset.y;
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    event.stopPropagation();
  }, []);

  const onWheelHandler = useCallback((e: WheelEvent) => {
    const container = elementHandler.current;
    // If the wheel event occurs within our SVG container, prevent it from zooming
    // the document, and handle it with the interactor.
    if (container && e.target instanceof Node && container.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();

      const cursorPosition = getOffsetXYHandler(e);
      if (!cursorPosition) {
        return;
      }

      if (e.altKey || e.shiftKey) {
        shiftXYHandler(-e.deltaX, -e.deltaY);
      } else {
        const targetScale = scale * (1 - e.deltaY * 0.0025);
        const scale = Math.max(MIN_ZOOM, Math.min(getMaxZoomHandler(), targetScale));
        adjustZoomRelativeToScreenPointHandler(scale, cursorPosition);
      }
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

  const autocenterHandler = useCallback((animate = false, scale?: number) => {
    const el = elementHandler.current!;
    const ownerRect = {width: el.clientWidth, height: el.clientHeight};
    const dw = ownerRect.width / (props.graphWidth - 100); // trim the padding aggressively
    const dh = ownerRect.height / (props.graphHeight - 100);
    const desiredScale = Math.min(dw, dh);
    const boundedScale =
      scale || Math.max(Math.min(desiredScale, props.maxAutocenterZoom), MIN_ZOOM);

    if (
      scale < boundedScale &&
      desiredScale !== boundedScale &&
      boundedScale === MIN_ZOOM
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

  const getMaxZoomHandler = useCallback(() => {
    return props.maxZoom;
  }, []);

  const onDoubleClickHandler = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    // Don't allow double-click events on the zoom slider to trigger this.
    if (event.target instanceof HTMLElement && event.target.closest('#zoom-slider-container')) {
      return;
    }
    autocenterHandler(true);
    event.stopPropagation();
  }, []);

  const element = useRef(React.createRef());
  const _animation = useRef(null);
  const resizeObserver = useRef(null);
  const dotsize = Math.max(14, 30 * scale);

  return (
    <div
      tabIndex={-1}
      ref={elementHandler}
      style={Object.assign({}, SVGViewportStyles, {
        backgroundPosition: `${x}px ${y}px`,
        backgroundSize: `${dotsize}px`,
      })}
      onMouseDown={(e) => onMouseDownHandler(this, e)}
      onDoubleClick={onDoubleClickHandler}
      onFocus={() => {
        document.addEventListener('wheel', onWheelHandler, {passive: false});
        props.onFocus();
      }}
      onBlur={() => {
        document.removeEventListener('wheel', onWheelHandler);
        props.onBlur();
      }}
    >
      <div
        dangerouslySetInnerHTML={{__html: props.content}}
        style={{
          transformOrigin: `top left`,
          transform: `matrix(${scale}, 0, 0, ${scale}, ${x}, ${y})`,
          pointerEvents: 'none',
        }}
      ></div>
    </div>
  );
};

const SVGViewportStyles: React.CSSProperties = {
  width: '100%',
  height: '100%',
  position: 'relative',
  overflow: 'hidden',
  userSelect: 'none',
  outline: 'none',
  borderRadius: '0.374rem',
  background: `rgb(255, 255, 255) url("data:image/svg+xml;utf8,<svg width='30px' height='30px' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'><circle fill='rgba(236, 236, 236, 1)' cx='5' cy='5' r='5' /></svg>") repeat`,
};

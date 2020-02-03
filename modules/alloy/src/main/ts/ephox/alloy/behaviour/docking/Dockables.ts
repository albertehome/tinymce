import { HTMLElement } from '@ephox/dom-globals';
import { Adt, Arr, Option } from '@ephox/katamari';
import { Attr, Class, Css, Element, Height, Width } from '@ephox/sugar';

import * as Boxes from '../../alien/Boxes';
import { AlloyComponent } from '../../api/component/ComponentApi';
import { DockingConfig, DockingContext, DockingMode } from './DockingTypes';

type StaticMorph<T> = () => T;
type AbsoluteMorph<T> = (x: number, y: number) => T;
type FixedMorph<T> = (left: number, top: number, bottom: number, mode: DockingMode) => T;

export interface MorphAdt {
  fold: <T> (
    statics: StaticMorph<T>,
    absolute: AbsoluteMorph<T>,
    fixed: FixedMorph<T>
  ) => T;
  match: <T> (branches: {
    static: StaticMorph<T>,
    absolute: AbsoluteMorph<T>,
    fixed: FixedMorph<T>,
  }) => T;
  log: (label: string) => void;
}

interface MorphConstructor {
  static: StaticMorph<MorphAdt>;
  absolute: AbsoluteMorph<MorphAdt>;
  fixed: FixedMorph<MorphAdt>;
}

const morphAdt: MorphConstructor = Adt.generate([
  { static: [ ] },
  { absolute: [ 'left', 'top' ] },
  { fixed: [ 'left', 'top', 'bottom', 'mode' ] }
]);

const appear = (component: AlloyComponent, contextualInfo: DockingContext): void => {
  const elem = component.element();
  Class.add(elem, contextualInfo.transitionClass);
  Class.remove(elem, contextualInfo.fadeOutClass);
  Class.add(elem, contextualInfo.fadeInClass);
  contextualInfo.onShow(component);
};

const disappear = (component: AlloyComponent, contextualInfo: DockingContext): void => {
  const elem = component.element();
  Class.add(elem, contextualInfo.transitionClass);
  Class.remove(elem, contextualInfo.fadeInClass);
  Class.add(elem, contextualInfo.fadeOutClass);
  contextualInfo.onHide(component);
};

const isPartiallyVisible = (box: Boxes.Bounds, viewport: Boxes.Bounds): boolean => {
  return box.y() < viewport.bottom() && box.bottom() > viewport.y();
};

const isTopCompletelyVisible = (box: Boxes.Bounds, viewport: Boxes.Bounds): boolean => {
  return box.y() >= viewport.y();
};

const isBottomCompletelyVisible = (box: Boxes.Bounds, viewport: Boxes.Bounds): boolean => {
  return box.bottom() <= viewport.bottom();
};

const isVisibleForModes = (modes: DockingMode[], box: Boxes.Bounds, viewport: Boxes.Bounds): boolean => {
  return Arr.forall(modes, (mode) => {
    switch (mode) {
      case 'bottom':
        return isBottomCompletelyVisible(box, viewport);
      case 'top':
        return isTopCompletelyVisible(box, viewport);
    }
  });
};

const getAttr = (elem: Element<HTMLElement>, attr: string): Option<number> => {
  return Attr.has(elem, attr) ? Option.some(
    parseInt(Attr.get(elem, attr), 10)
  ) : Option.none();
};

const getPrior = (elem: Element<HTMLElement>, dockInfo: DockingConfig): Option<Boxes.Bounds> => {
  return getAttr(elem, dockInfo.leftAttr).bind((left) => {
    return getAttr(elem, dockInfo.topAttr).map((top) => {
      // Only supports position absolute.
      const w = Width.get(elem);
      const h = Height.get(elem);
      return Boxes.bounds(left, top, w, h);
    });
  });
};

const setPrior = (elem: Element<HTMLElement>, dockInfo: DockingConfig, absLeft: string | number, absTop: string | number, position: string): void => {
  Attr.set(elem, dockInfo.leftAttr, absLeft);
  Attr.set(elem, dockInfo.topAttr, absTop);
  Attr.set(elem, dockInfo.positionAttr, position);
};

const clearPrior = (elem: Element<HTMLElement>, dockInfo: DockingConfig): void => {
  Attr.remove(elem, dockInfo.leftAttr);
  Attr.remove(elem, dockInfo.topAttr);
  Attr.remove(elem, dockInfo.positionAttr);
};

const revertToOriginal = (elem: Element<HTMLElement>, dockInfo: DockingConfig, box: Boxes.Bounds): Option<MorphAdt> => {
  const position = Attr.get(elem, dockInfo.positionAttr);
  // Revert it back to the original position
  clearPrior(elem, dockInfo);
  switch (position) {
    case 'static':
      return Option.some(morphAdt.static());
    case 'absolute':
      return Option.some(morphAdt.absolute(box.x(), box.y()));
    default:
      return Option.none();
  }
};

const morphToOriginal = (elem: Element<HTMLElement>, dockInfo: DockingConfig, viewport: Boxes.Bounds): Option<MorphAdt> => {
  return getPrior(elem, dockInfo)
    .filter((box) => isVisibleForModes(dockInfo.modes, box, viewport))
    .bind((box) => revertToOriginal(elem, dockInfo, box));
};

const morphToFixed = (elem: Element<HTMLElement>, dockInfo: DockingConfig, viewport: Boxes.Bounds): Option<MorphAdt> => {
  const box = Boxes.box(elem);
  if (!isVisibleForModes(dockInfo.modes, box, viewport)) {
    const position = Css.get(elem, 'position');
    // Convert it to fixed (keeping the x coordinate and throwing away the y coordinate)
    setPrior(elem, dockInfo, box.x(), box.y(), position);

    // Calculate the fixed position
    const winBox = Boxes.win();
    const left = box.x() - winBox.x();
    const top = viewport.y() - winBox.y();
    const bottom = winBox.bottom() - viewport.bottom();

    // Check whether we are docking the bottom of the viewport, or the top
    const dockMode = box.y() <= viewport.y() ? 'top' : 'bottom';
    return Option.some(morphAdt.fixed(left, top, bottom, dockMode));
  } else {
    return Option.none();
  }
};

const getMorph = (component: AlloyComponent, dockInfo: DockingConfig, viewport: Boxes.Bounds): Option<MorphAdt> => {
  const elem = component.element();
  const isDocked = Css.getRaw(elem, 'position').is('fixed');
  return isDocked ? morphToOriginal(elem, dockInfo, viewport) : morphToFixed(elem, dockInfo, viewport);
};

const getMorphToOriginal = (component: AlloyComponent, dockInfo: DockingConfig): Option<MorphAdt> => {
  const elem = component.element();
  return getPrior(elem, dockInfo).bind((box) => revertToOriginal(elem, dockInfo, box));
};

export {
  appear,
  disappear,
  isPartiallyVisible,
  getMorph,
  getMorphToOriginal
};

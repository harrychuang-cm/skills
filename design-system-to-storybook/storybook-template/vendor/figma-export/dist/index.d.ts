export { createFigmaExportDecorator, createFigmaExportGlobalTypes, createFigmaExportInitialGlobals, getFigmaExportGlobalName } from './preview.js';
import { F as FigmaExportPayload } from './options-Bj3uxPVS.js';
export { a as FigmaBindingName, b as FigmaExportAddonOptions, c as FigmaExportNode, d as FigmaExportToken, e as FigmaLayoutStrategy, f as FigmaNodeKind, R as ResolvedFigmaExportAddonOptions, T as TokenLayer, g as defaultFigmaExportGlobalName, i as isStoryIncludedForFigmaExport, r as resolveFigmaExportAddonOptions } from './options-Bj3uxPVS.js';
import './visualComment-CktpX_T5.js';

declare function createFigmaExportJson(payload: FigmaExportPayload): string;
declare function createFigmaPluginCode(payload: FigmaExportPayload): string;

export { FigmaExportPayload, createFigmaExportJson, createFigmaPluginCode };

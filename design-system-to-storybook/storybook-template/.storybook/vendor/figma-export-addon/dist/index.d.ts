import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';
import { F as FigmaExportAddonOptions } from './options-C-KiYN0_.js';
export { R as ResolvedFigmaExportAddonOptions, d as defaultFigmaExportGlobalName, i as isStoryIncludedForFigmaExport, r as resolveFigmaExportAddonOptions } from './options-C-KiYN0_.js';
export { createFigmaExportDecorator, createFigmaExportGlobalTypes, createFigmaExportInitialGlobals, getFigmaExportGlobalName } from './preview.js';
export { FigmaImporterPluginMainCodeOptions, createFigmaExportJson, createFigmaImporterPluginMainCode, createFigmaPluginCode } from './plugin-code.js';
export { a as FigmaBindingName, b as FigmaExportNode, F as FigmaExportPayload, c as FigmaExportToken, d as FigmaLayoutStrategy, e as FigmaNodeKind, T as TokenLayer } from './types-BuDkFEZo.js';

type StorybookContext = {
    globals?: Record<string, unknown>;
    id?: string;
    name?: string;
    title?: string;
};
type FigmaCodeExporterProps = {
    children?: ReactNode;
    context: StorybookContext;
    options?: FigmaExportAddonOptions;
};
declare function FigmaCodeExporter({ children, context, options, }: FigmaCodeExporterProps): react_jsx_runtime.JSX.Element;

type FigmaExportToolOptions = {
    addonId?: string;
    globalName?: string;
};
declare const figmaExportAddonId = "storybook/figma-export";
declare function registerFigmaExportTool(options?: FigmaExportToolOptions): void;

export { FigmaCodeExporter, FigmaExportAddonOptions, figmaExportAddonId, registerFigmaExportTool };

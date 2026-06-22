import { F as FigmaExportPayload } from './types-BuDkFEZo.js';

declare function createFigmaExportJson(payload: FigmaExportPayload): string;
type FigmaImporterPluginMainCodeOptions = {
    height?: number;
    width?: number;
};
declare function createFigmaImporterPluginMainCode(options?: FigmaImporterPluginMainCodeOptions): string;
declare function createFigmaPluginCode(payload: FigmaExportPayload): string;

export { type FigmaImporterPluginMainCodeOptions, createFigmaExportJson, createFigmaImporterPluginMainCode, createFigmaPluginCode };

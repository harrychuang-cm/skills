import { T as TokenLayer } from './types-BuDkFEZo.js';

type FigmaExportAddonOptions = {
    absoluteFidelityComponents?: string[];
    collections?: Partial<Record<TokenLayer, string>>;
    componentClassPrefixes?: string[];
    embeddedSvgByDataGraphic?: Record<string, string>;
    globalName?: string;
    pluginDataKey?: string;
    storyTitlePrefix?: false | string | string[];
    tokenLayers?: Partial<Record<TokenLayer, string>>;
    tokenPrefix?: string;
};
type ResolvedFigmaExportAddonOptions = {
    absoluteFidelityComponents: Set<string>;
    collections: Record<TokenLayer, string>;
    componentClassPrefixes: string[];
    embeddedSvgByDataGraphic: Record<string, string>;
    globalName: string;
    pluginDataKey: string;
    storyTitlePrefix: false | string[];
    tokenLayers: Record<TokenLayer, string>;
    tokenPrefix?: string;
};
declare const defaultFigmaExportGlobalName = "figmaExport";
declare function resolveFigmaExportAddonOptions(options: FigmaExportAddonOptions | undefined): ResolvedFigmaExportAddonOptions;
declare function isStoryIncludedForFigmaExport(title: string | undefined, options: ResolvedFigmaExportAddonOptions): boolean;

export { type FigmaExportAddonOptions as F, type ResolvedFigmaExportAddonOptions as R, defaultFigmaExportGlobalName as d, isStoryIncludedForFigmaExport as i, resolveFigmaExportAddonOptions as r };

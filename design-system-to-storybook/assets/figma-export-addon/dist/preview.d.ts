import * as react from 'react';
import { ReactNode } from 'react';
import { F as FigmaExportAddonOptions } from './options-C7dKT9Sy.js';

type StorybookContext = {
    globals?: Record<string, unknown>;
    id?: string;
    name?: string;
    title?: string;
};
type StorybookStory = () => ReactNode;
declare function getFigmaExportGlobalName(options?: FigmaExportAddonOptions): string;
declare function createFigmaExportDecorator(options?: FigmaExportAddonOptions): (Story: StorybookStory, context: StorybookContext) => react.FunctionComponentElement<{
    children?: ReactNode;
    context: {
        globals?: Record<string, unknown>;
        id?: string;
        name?: string;
        title?: string;
    };
    options?: FigmaExportAddonOptions;
}>;
declare function createFigmaExportGlobalTypes(options?: FigmaExportAddonOptions): Record<string, {
    defaultValue: "off";
    description: string;
}>;
declare function createFigmaExportInitialGlobals(options?: FigmaExportAddonOptions): Record<string, "off">;

export { createFigmaExportDecorator, createFigmaExportGlobalTypes, createFigmaExportInitialGlobals, getFigmaExportGlobalName };

type TokenLayer = "ref" | "sys" | "comp";
type FigmaVariableType = "BOOLEAN" | "COLOR" | "FLOAT" | "STRING";
type FigmaVariableValue = boolean | number | string | {
    a: number;
    b: number;
    g: number;
    r: number;
};
type FigmaExportToken = {
    alias?: string;
    collection: TokenLayer;
    cssName: string;
    figmaName: string;
    rawValue: string;
    scopes: string[];
    type: FigmaVariableType;
    value?: FigmaVariableValue;
};
type FigmaBindingName = "backgroundColor" | "borderColor" | "borderWidth" | "cornerRadius" | "fontFamily" | "fontSize" | "fontWeight" | "gap" | "height" | "lineHeight" | "opacity" | "paddingBottom" | "paddingLeft" | "paddingRight" | "paddingTop" | "textColor" | "width";
type FigmaLayoutStrategy = "absolute" | "autoLayout";
type FigmaNodeKind = "frame" | "image" | "svg" | "text";
type FigmaExportArtifactKind = "component" | "page";
type FigmaComponentReference = {
    key: string;
    name: string;
    sourceName: string;
    variant?: string;
    variantProperties?: Record<string, string>;
};
type FigmaExportLinearGradient = {
    angle: number;
    stops: Array<{
        color: string;
        position: number;
        token?: string;
    }>;
};
type FigmaExportNode = {
    bindings: Partial<Record<FigmaBindingName, string>>;
    children: FigmaExportNode[];
    component?: FigmaComponentReference;
    kind: FigmaNodeKind;
    layoutStrategy?: FigmaLayoutStrategy;
    name: string;
    svgText?: string;
    text?: string;
    styles: {
        alignItems?: string;
        backgroundColor?: string;
        backgroundLinearGradient?: FigmaExportLinearGradient;
        borderColor?: string;
        borderWidth?: number;
        color?: string;
        display?: string;
        flexDirection?: string;
        fontFamily?: string;
        fontSize?: number;
        fontWeight?: number;
        gap?: number;
        height: number;
        justifyContent?: string;
        layoutAlign?: "STRETCH";
        layoutGrow?: number;
        layoutSizingHorizontal?: "HUG";
        layoutSizingVertical?: "HUG";
        lineHeight?: number | "normal";
        opacity?: number;
        overflow?: string;
        paddingBottom?: number;
        paddingLeft?: number;
        paddingRight?: number;
        paddingTop?: number;
        bottomLeftRadius?: number;
        bottomRightRadius?: number;
        radius?: number;
        textAlign?: string;
        textAutoResize?: "WIDTH_AND_HEIGHT";
        topLeftRadius?: number;
        topRightRadius?: number;
        width: number;
        x: number;
        y: number;
    };
};
type FigmaExportPayload = {
    artifactKind: FigmaExportArtifactKind;
    component?: FigmaComponentReference;
    componentTitle: string;
    generatedAt: string;
    root: FigmaExportNode;
    storyId: string;
    storyName: string;
    storyTitle: string;
    tokenSystem: {
        collections: Record<TokenLayer, string>;
        layers: Record<TokenLayer, string>;
        pluginDataKey: string;
        prefix: string;
    };
    tokens: FigmaExportToken[];
    version: 2;
};

export type { FigmaExportPayload as F, TokenLayer as T, FigmaBindingName as a, FigmaExportNode as b, FigmaExportToken as c, FigmaLayoutStrategy as d, FigmaNodeKind as e };

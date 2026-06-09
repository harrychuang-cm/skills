export type FigmaSourceResolverOptions = {
  componentSpecModules?: Record<string, string>;
  designSystemFileUrl?: string;
  nodeOverrides?: Record<string, string>;
  specModulePathForSlug?: (slug: string) => string;
};

export type StoryParameters = Record<string, unknown> | undefined;

export declare function getParameterUrl(value: unknown): string | undefined;

export declare function getComponentSourceSlug(componentTitle: unknown): string;

export declare function getFigmaNodeId(value: string): string | undefined;

export declare function getDocumentedFigmaSourceUrl(
  componentTitle: unknown,
  options: FigmaSourceResolverOptions,
): string | undefined;

export declare function getFigmaSourceUrl(
  parameters: StoryParameters,
  componentTitle: string,
  options?: FigmaSourceResolverOptions,
): string | undefined;

export declare function getExportComponentTitle(
  title: string | undefined,
  storyTitlePrefix: string[] | false,
): string;

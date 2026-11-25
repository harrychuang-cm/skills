export const storybookTemplateProjectConfig = {
  project: {
    projectName: "Fixture v1",
    packageName: "fixture-v1-storybook",
    tokenPrefix: "fx",
    componentClassPrefixes: ["fx-"],
  },
  storybook: {
    stories: ["../src/**/*.stories.@(ts|tsx)"],
  },
} as const;

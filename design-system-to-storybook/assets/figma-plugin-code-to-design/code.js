"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
function getTextAlignHorizontal(spec, options) {
    var _a;
    var explicitTextAlign = mapTextAlignHorizontal(spec.styles.textAlign);
    if (explicitTextAlign)
        return explicitTextAlign;
    if (spec.kind === "text" && spec.styles.layoutAlign === "STRETCH")
        return "CENTER";
    return ((_a = options.inferredTextAlignHorizontal) !== null && _a !== void 0 ? _a : "LEFT");
}
function applyTextAlignHorizontal(node, spec, options, path) {
    try {
        node.textAlignHorizontal = getTextAlignHorizontal(spec, options);
    }
    catch (error) {
        console.warn("Could not set ".concat(path, ".textAlignHorizontal: ").concat(formatError(error)));
    }
}
function applyTextAlignVertical(node, value, path) {
    if (!value)
        return;
    try {
        node.textAlignVertical = value;
    }
    catch (error) {
        console.warn("Could not set ".concat(path, ".textAlignVertical: ").concat(formatError(error)));
    }
}
function applyTextAlignmentFromSpec(node, spec, options, path) {
    var _a;
    if (node.type === "TEXT" && spec.kind === "text") {
        applyTextAlignHorizontal(node, spec, options, path);
        applyTextAlignVertical(node, spec.styles.textAlignVertical, path);
        return;
    }
    if (!("children" in node))
        return;
    var children = Array.from(node.children).filter(function (child) { return "visible" in child; });
    var specChildren = (_a = spec.children) !== null && _a !== void 0 ? _a : [];
    var usedChildIndexes = new Set();
    var _loop_1 = function (specIndex) {
        var childSpec = specChildren[specIndex];
        var namedIndex = children.findIndex(function (child, childIndex) {
            return !usedChildIndexes.has(childIndex) && child.name === childSpec.name;
        });
        var fallbackIndex = specIndex < children.length && !usedChildIndexes.has(specIndex) ? specIndex : -1;
        var childIndex = namedIndex >= 0 ? namedIndex : fallbackIndex;
        if (childIndex < 0)
            return "continue";
        usedChildIndexes.add(childIndex);
        applyTextAlignmentFromSpec(children[childIndex], childSpec, options, "".concat(path, "/").concat(childSpec.name));
    };
    for (var specIndex = 0; specIndex < specChildren.length; specIndex += 1) {
        _loop_1(specIndex);
    }
}
// Bump this on every behavior change so the Figma UI badge confirms which
// build is running (Figma re-reads code.js per run, but the badge removes doubt).
var PLUGIN_VERSION = "1.1.8 (2026-06-25)";
var SUPPORTED_PAYLOAD_VERSIONS = [1, 2];
var DEFAULT_TOKEN_PLUGIN_DATA_KEY = "storybookCssToken";
var LEGACY_CM_TOKEN_PLUGIN_DATA_KEY = "cmCssToken";
var STORYBOOK_COMPONENT_PLUGIN_DATA_KEY = "storybookComponentKey";
var COMPONENT_SET_GRID_GAP = 32;
var COMPONENT_SET_GRID_MIN_CELL_WIDTH = 96;
var COMPONENT_SET_GRID_MIN_CELL_HEIGHT = 72;
var COMPONENT_SET_GRID_COMPACT_MAX_SIZE = 96;
var COMPONENT_SET_GRID_MEDIUM_MAX_SIZE = 180;
var COMPONENT_SET_GRID_COMPACT_COLUMNS = 8;
var COMPONENT_SET_GRID_MEDIUM_COLUMNS = 4;
var COMPONENTS_PAGE_NAME = "Components";
var COMPONENT_SECTION_GAP = 160;
var COMPONENT_SECTION_MIN_HEIGHT = 160;
var COMPONENT_SECTION_MIN_WIDTH = 240;
var COMPONENT_SECTION_PADDING = 64;
var COMPONENT_SECTION_PLUGIN_DATA_KEY = "storybookComponentSectionKey";
var COMPONENT_SPEC_HASH_PLUGIN_DATA_KEY = "storybookComponentSpecHash";
var COMPONENT_SECTION_ROLE_PLUGIN_DATA_KEY = "storybookComponentSectionRole";
var STORYBOOK_STORY_PLUGIN_DATA_KEY = "storybookStoryId";
var COLLECTION_NAMES = {
    comp: "comp",
    ref: "ref",
    sys: "sys",
};
var COLLECTION_ORDER = {
    ref: 0,
    sys: 1,
    comp: 2,
};
var INDIVIDUAL_RADIUS_BINDING_FIELDS = [
    "topLeftRadius",
    "topRightRadius",
    "bottomLeftRadius",
    "bottomRightRadius",
];
figma.showUI(__html__, {
    height: 600,
    themeColors: true,
    width: 440,
});
figma.ui.postMessage({ type: "plugin-version", version: PLUGIN_VERSION });
figma.ui.onmessage = function (msg) {
    if (msg.type === "cancel") {
        figma.closePlugin();
        return;
    }
    if (msg.type === "import-json") {
        void importFromJson(msg.json);
    }
};
function importFromJson(json) {
    return __awaiter(this, void 0, void 0, function () {
        var payload, stats, error_1, message;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    figma.ui.postMessage({ status: "importing", type: "import-status" });
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    payload = parsePayload(json);
                    return [4 /*yield*/, importStorybookDesign(payload)];
                case 2:
                    stats = _b.sent();
                    figma.ui.postMessage({
                        stats: stats,
                        type: "import-complete",
                    });
                    figma.notify("Imported ".concat(payload.componentTitle, " / ").concat(payload.storyName, " as ").concat((_a = stats.rootType) !== null && _a !== void 0 ? _a : "node", ": ").concat(stats.nodesCreated, " nodes, ").concat(stats.tokensChecked, " variables checked. (plugin v").concat(PLUGIN_VERSION, ")"));
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _b.sent();
                    message = error_1 instanceof Error ? error_1.message : String(error_1);
                    figma.ui.postMessage({
                        message: message,
                        type: "import-error",
                    });
                    figma.notify("Storybook Code To Design import failed: ".concat(message), { error: true });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function importStorybookDesign(payload) {
    return __awaiter(this, void 0, void 0, function () {
        var artifactKind, shouldImportAsComponent, targetPage, _a, context, rootComponent, rootNode, _b, _c, componentViewportNode, viewportNode, componentDefinitionsPage, dependencySections;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, figma.loadAllPagesAsync()];
                case 1:
                    _d.sent();
                    artifactKind = getPayloadArtifactKind(payload);
                    shouldImportAsComponent = artifactKind === "component";
                    if (!shouldImportAsComponent) return [3 /*break*/, 3];
                    return [4 /*yield*/, getOrCreateComponentsPage()];
                case 2:
                    _a = _d.sent();
                    return [3 /*break*/, 5];
                case 3: return [4 /*yield*/, getPageArtifactTargetPage(payload)];
                case 4:
                    _a = _d.sent();
                    _d.label = 5;
                case 5:
                    targetPage = _a;
                    return [4 /*yield*/, setCurrentPageIfNeeded(targetPage)];
                case 6:
                    _d.sent();
                    context = createImportContext(payload);
                    return [4 /*yield*/, context.upsertVariables()];
                case 7:
                    _d.sent();
                    if (!!shouldImportAsComponent) return [3 /*break*/, 9];
                    return [4 /*yield*/, context.preparePageComponentDefinitions(payload.root)];
                case 8:
                    _d.sent();
                    _d.label = 9;
                case 9:
                    rootComponent = getPayloadRootComponent(payload, artifactKind);
                    if (!(shouldImportAsComponent &&
                        rootComponent &&
                        context.canCreateComponentDefinition(payload.root))) return [3 /*break*/, 11];
                    return [4 /*yield*/, context.ensureComponentDefinition(payload.root, rootComponent, payload.root.name, { reuseComponents: true })];
                case 10:
                    _b = _d.sent();
                    return [3 /*break*/, 16];
                case 11:
                    if (!shouldImportAsComponent) return [3 /*break*/, 13];
                    return [4 /*yield*/, context.createComponentSetFromVariants(payload.root, payload.componentTitle)];
                case 12:
                    _c = _d.sent();
                    return [3 /*break*/, 15];
                case 13: return [4 /*yield*/, context.createNode(payload.root, payload.root.name, {
                        isRoot: true,
                        reuseComponents: true,
                    })];
                case 14:
                    _c = _d.sent();
                    _d.label = 15;
                case 15:
                    _b = _c;
                    _d.label = 16;
                case 16:
                    rootNode = _b;
                    if (shouldImportAsComponent && rootComponent) {
                        rootNode.name = getComponentDisplayName(rootComponent);
                    }
                    else if (rootNode.type !== "COMPONENT_SET") {
                        rootNode.name = "".concat(payload.componentTitle, " / ").concat(payload.storyName);
                    }
                    componentViewportNode = shouldImportAsComponent
                        ? getComponentImportViewportNode(rootNode)
                        : rootNode;
                    viewportNode = shouldImportAsComponent
                        ? placeComponentImportInSection(componentViewportNode, payload, targetPage)
                        : rootNode;
                    componentDefinitionsPage = shouldImportAsComponent
                        ? targetPage
                        : context.getComponentDefinitionParentPage();
                    dependencySections = context.organizeComponentDependencySections(rootNode, componentDefinitionsPage);
                    if (!shouldImportAsComponent) {
                        rootNode.x = 0;
                        rootNode.y = 0;
                    }
                    if (!rootNode.parent)
                        figma.currentPage.appendChild(rootNode);
                    if (viewportNode.parent === figma.currentPage) {
                        figma.currentPage.selection = [viewportNode];
                    }
                    cleanupEmptyManagedSections(componentDefinitionsPage);
                    figma.viewport.scrollAndZoomIntoView([viewportNode]);
                    context.stats.artifactKind = artifactKind;
                    context.stats.importedAsComponent = shouldImportAsComponent;
                    context.stats.componentSectionsOrganized =
                        dependencySections.length + (viewportNode.type === "SECTION" ? 1 : 0);
                    context.stats.rootName = rootNode.name;
                    context.stats.rootType = rootNode.type;
                    context.stats.targetPageName = targetPage.name;
                    if (viewportNode.type === "SECTION") {
                        context.stats.sectionName = viewportNode.name;
                    }
                    return [2 /*return*/, context.stats];
            }
        });
    });
}
function getPayloadArtifactKind(payload) {
    var _a;
    if (payload.artifactKind)
        return payload.artifactKind;
    if ((_a = payload.storyTitle) === null || _a === void 0 ? void 0 : _a.startsWith("Pages/"))
        return "page";
    return "component";
}
function getPayloadRootComponent(payload, artifactKind) {
    var _a;
    if (artifactKind !== "component")
        return undefined;
    return (_a = payload.component) !== null && _a !== void 0 ? _a : payload.root.component;
}
function getOrCreateComponentsPage() {
    return __awaiter(this, void 0, void 0, function () {
        var existing, page;
        return __generator(this, function (_a) {
            existing = figma.root.children.find(function (page) { return page.name === COMPONENTS_PAGE_NAME; });
            if (existing)
                return [2 /*return*/, existing];
            page = figma.createPage();
            page.name = COMPONENTS_PAGE_NAME;
            return [2 /*return*/, page];
        });
    });
}
function setCurrentPageIfNeeded(page) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (figma.currentPage.id === page.id)
                        return [2 /*return*/];
                    return [4 /*yield*/, figma.setCurrentPageAsync(page)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function getPageArtifactTargetPage(payload) {
    return __awaiter(this, void 0, void 0, function () {
        var componentsPageName, pageName, existing, page;
        var _a, _b;
        return __generator(this, function (_c) {
            componentsPageName = ((_b = (_a = payload.componentSystem) === null || _a === void 0 ? void 0 : _a.componentsPageName) === null || _b === void 0 ? void 0 : _b.trim()) || COMPONENTS_PAGE_NAME;
            if (figma.currentPage.name.toLowerCase() !== componentsPageName.toLowerCase()) {
                return [2 /*return*/, figma.currentPage];
            }
            pageName = getPageArtifactPageName(payload);
            existing = figma.root.children.find(function (page) { return page.name.toLowerCase() === pageName.toLowerCase(); });
            if (existing)
                return [2 /*return*/, existing];
            page = figma.createPage();
            page.name = pageName;
            return [2 /*return*/, page];
        });
    });
}
function getPageArtifactPageName(payload) {
    var title = (payload.storyTitle || payload.componentTitle || "").trim();
    var normalizedTitle = title.startsWith("Pages/")
        ? title.slice("Pages/".length)
        : title;
    return normalizedTitle.replace(/\//g, " / ") || "Storybook Pages";
}
function placeComponentImportInSection(rootNode, payload, targetPage) {
    var rootComponent = getComponentImportSectionReference(rootNode, payload);
    var shouldUseComponentSection = Boolean(rootComponent && (rootComponent.variant || rootNode.type === "COMPONENT_SET"));
    return placeNodeInComponentSection(rootNode, targetPage, {
        key: shouldUseComponentSection && rootComponent
            ? getComponentReferenceSectionKey(rootComponent)
            : getRootComponentSectionKey(payload),
        metadata: {
            componentTitle: payload.componentTitle,
            storyId: payload.storyId,
            storyName: payload.storyName,
        },
        name: shouldUseComponentSection && rootComponent
            ? getComponentReferenceSectionName(rootComponent)
            : getComponentSectionName(payload),
        role: "root",
    });
}
function getComponentImportSectionReference(rootNode, payload) {
    var rootComponent = getPayloadRootComponent(payload, "component");
    if (rootComponent)
        return rootComponent;
    if (rootNode.type !== "COMPONENT_SET")
        return undefined;
    var name = getNodePluginData(rootNode, "storybookComponentName") ||
        payload.componentTitle ||
        rootNode.name ||
        "Component";
    var sourceName = getNodePluginData(rootNode, "storybookComponentSource") || name;
    return {
        key: "component:".concat(sourceName),
        name: name,
        sourceName: sourceName,
    };
}
function getComponentImportViewportNode(rootNode) {
    var _a;
    if (rootNode.type === "COMPONENT" && ((_a = rootNode.parent) === null || _a === void 0 ? void 0 : _a.type) === "COMPONENT_SET") {
        return rootNode.parent;
    }
    return rootNode;
}
function placeNodeInComponentSection(node, targetPage, target) {
    var _a = getOrCreateComponentSection(targetPage, target.name, target.key), created = _a.created, section = _a.section;
    configureComponentSection(section, target);
    if (created) {
        positionNewComponentSection(section, targetPage);
    }
    for (var _i = 0, _b = __spreadArray([], section.children, true); _i < _b.length; _i++) {
        var child = _b[_i];
        if (child.id !== node.id)
            child.remove();
    }
    if (node.parent !== section) {
        section.appendChild(node);
    }
    node.x = COMPONENT_SECTION_PADDING;
    node.y = COMPONENT_SECTION_PADDING;
    resizeSectionToChild(section, node);
    return section;
}
function getOrCreateComponentSection(targetPage, sectionName, sectionKey) {
    var existing = targetPage.children.find(function (node) {
        return (node.type === "SECTION" &&
            (getNodePluginData(node, COMPONENT_SECTION_PLUGIN_DATA_KEY) === sectionKey ||
                getNodePluginData(node, STORYBOOK_STORY_PLUGIN_DATA_KEY) === sectionKey ||
                node.name === sectionName));
    });
    if (existing)
        return { created: false, section: existing };
    var section = figma.createSection();
    if (section.parent !== targetPage) {
        targetPage.appendChild(section);
    }
    return { created: true, section: section };
}
function configureComponentSection(section, target) {
    var _a, _b, _c;
    section.name = target.name;
    section.fills = [whitePaint()];
    section.strokes = [];
    setNodePluginData(section, COMPONENT_SECTION_PLUGIN_DATA_KEY, target.key);
    setNodePluginData(section, COMPONENT_SECTION_ROLE_PLUGIN_DATA_KEY, target.role);
    if ((_a = target.metadata) === null || _a === void 0 ? void 0 : _a.storyId) {
        setNodePluginData(section, STORYBOOK_STORY_PLUGIN_DATA_KEY, target.metadata.storyId);
    }
    if ((_b = target.metadata) === null || _b === void 0 ? void 0 : _b.componentTitle) {
        setNodePluginData(section, "storybookComponentTitle", target.metadata.componentTitle);
    }
    if ((_c = target.metadata) === null || _c === void 0 ? void 0 : _c.storyName) {
        setNodePluginData(section, "storybookStoryName", target.metadata.storyName);
    }
}
function getComponentSectionName(payload) {
    var componentTitle = payload.componentTitle.trim() || "Component";
    var storyName = payload.storyName.trim();
    return storyName ? "".concat(componentTitle, " / ").concat(storyName) : componentTitle;
}
function getRootComponentSectionKey(payload) {
    return "story:".concat(payload.storyId);
}
function getComponentReferenceSectionKey(component) {
    var source = String(component.sourceName || component.name || component.key).trim();
    return "component:".concat(source || component.key);
}
function getComponentReferenceSectionName(component) {
    return component.name || component.sourceName || "Component";
}
function cleanupEmptyManagedSections(targetPage) {
    for (var _i = 0, _a = __spreadArray([], targetPage.children, true); _i < _a.length; _i++) {
        var node = _a[_i];
        if (node.type !== "SECTION")
            continue;
        var isManagedSection = Boolean(getNodePluginData(node, COMPONENT_SECTION_PLUGIN_DATA_KEY) ||
            getNodePluginData(node, STORYBOOK_STORY_PLUGIN_DATA_KEY));
        if (isManagedSection && node.children.length === 0) {
            node.remove();
        }
    }
}
function collectSceneNodeIds(node, ids) {
    if (ids === void 0) { ids = new Set(); }
    ids.add(node.id);
    if (!("children" in node))
        return ids;
    for (var _i = 0, _a = node.children; _i < _a.length; _i++) {
        var child = _a[_i];
        if ("visible" in child)
            collectSceneNodeIds(child, ids);
    }
    return ids;
}
function positionNewComponentSection(section, targetPage) {
    var existingSections = targetPage.children.filter(function (node) { return node.type === "SECTION" && node.id !== section.id; });
    var nextY = existingSections.length === 0
        ? 0
        : Math.max.apply(Math, existingSections.map(function (node) { return node.y + safeNumber(node.height, 0); })) + COMPONENT_SECTION_GAP;
    section.x = 0;
    section.y = nextY;
}
function resizeSectionToChild(section, child) {
    section.resizeWithoutConstraints(Math.max(COMPONENT_SECTION_MIN_WIDTH, getSceneNodeWidth(child) + COMPONENT_SECTION_PADDING * 2), Math.max(COMPONENT_SECTION_MIN_HEIGHT, getSceneNodeHeight(child) + COMPONENT_SECTION_PADDING * 2));
}
function getSceneNodeWidth(node) {
    return safeNumber(node.width, 1);
}
function getSceneNodeHeight(node) {
    return safeNumber(node.height, 1);
}
function whitePaint() {
    return {
        color: { b: 1, g: 1, r: 1 },
        opacity: 1,
        type: "SOLID",
    };
}
function createImportContext(payload) {
    var _a, _b, _c, _d, _e, _f;
    var artifactKind = getPayloadArtifactKind(payload);
    var tokens = payload.tokens;
    var collectionNames = __assign(__assign({}, COLLECTION_NAMES), ((_b = (_a = payload.tokenSystem) === null || _a === void 0 ? void 0 : _a.collections) !== null && _b !== void 0 ? _b : {}));
    var tokenPluginDataKey = (_d = (_c = payload.tokenSystem) === null || _c === void 0 ? void 0 : _c.pluginDataKey) !== null && _d !== void 0 ? _d : DEFAULT_TOKEN_PLUGIN_DATA_KEY;
    var componentPluginDataKey = (_f = (_e = payload.componentSystem) === null || _e === void 0 ? void 0 : _e.pluginDataKey) !== null && _f !== void 0 ? _f : STORYBOOK_COMPONENT_PLUGIN_DATA_KEY;
    var tokenByCssName = new Map(tokens.map(function (token) { return [token.cssName, token]; }));
    var registry = new Map();
    var componentRegistry = new Map();
    var componentDefinitionRecords = new Map();
    var componentSetRecords = new Map();
    var warnedVariantPropertyNodeIds = new Set();
    var componentDefinitionOffsetY = 0;
    var stats = {
        componentDefinitionsPrepared: 0,
        componentsCreated: 0,
        nodesCreated: 0,
        reusedComponents: 0,
        reusedVariables: 0,
        tokensChecked: tokens.length,
        variablesCreated: 0,
        warnings: [],
    };
    function warn(message) {
        stats.warnings.push(message);
    }
    function upsertVariables() {
        return __awaiter(this, void 0, void 0, function () {
            var sorted, _i, sorted_1, token;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        sorted = __spreadArray([], tokens, true).sort(function (a, b) {
                            var byCollection = COLLECTION_ORDER[a.collection] - COLLECTION_ORDER[b.collection];
                            return byCollection || a.figmaName.localeCompare(b.figmaName);
                        });
                        _i = 0, sorted_1 = sorted;
                        _a.label = 1;
                    case 1:
                        if (!(_i < sorted_1.length)) return [3 /*break*/, 4];
                        token = sorted_1[_i];
                        return [4 /*yield*/, upsertVariable(token, [])];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    }
    function upsertVariable(spec, stack) {
        return __awaiter(this, void 0, void 0, function () {
            var registered, aliasTarget, aliasSpec, _a, collection, modeId, variable;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        registered = registry.get(spec.cssName);
                        if (registered)
                            return [2 /*return*/, registered];
                        if (stack.includes(spec.cssName)) {
                            throw new Error("Circular token alias detected: ".concat(__spreadArray(__spreadArray([], stack, true), [spec.cssName], false).join(" -> ")));
                        }
                        if (!spec.alias) return [3 /*break*/, 5];
                        aliasSpec = tokenByCssName.get(spec.alias);
                        if (!aliasSpec) return [3 /*break*/, 2];
                        return [4 /*yield*/, upsertVariable(aliasSpec, __spreadArray(__spreadArray([], stack, true), [spec.cssName], false))];
                    case 1:
                        _a = _b.sent();
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, findVariableByCssToken(spec.alias, tokenPluginDataKey)];
                    case 3:
                        _a = _b.sent();
                        _b.label = 4;
                    case 4:
                        aliasTarget = _a;
                        if (!aliasTarget) {
                            throw new Error("Missing alias target ".concat(spec.alias, " for ").concat(spec.cssName));
                        }
                        _b.label = 5;
                    case 5: return [4 /*yield*/, getCollection(spec.collection, collectionNames)];
                    case 6:
                        collection = _b.sent();
                        modeId = collection.modes[0].modeId;
                        return [4 /*yield*/, findExistingVariable(collection, spec, tokenPluginDataKey)];
                    case 7:
                        variable = _b.sent();
                        if (variable && variable.resolvedType !== spec.type) {
                            throw new Error("Variable type mismatch for ".concat(spec.cssName, ": existing ").concat(variable.resolvedType, ", export ").concat(spec.type));
                        }
                        if (variable) {
                            stats.reusedVariables += 1;
                        }
                        else {
                            variable = figma.variables.createVariable(spec.figmaName, collection, spec.type);
                            stats.variablesCreated += 1;
                        }
                        setVariableMetadata(variable, spec);
                        setVariableValue(variable, modeId, spec, aliasTarget);
                        registry.set(spec.cssName, variable);
                        return [2 /*return*/, variable];
                }
            });
        });
    }
    function setVariableMetadata(variable, spec) {
        var _a, _b;
        if (Array.isArray(spec.scopes) && spec.scopes.length > 0) {
            try {
                variable.scopes = spec.scopes;
            }
            catch (error) {
                warn("Could not set scopes for ".concat(spec.cssName, ": ").concat(formatError(error)));
            }
        }
        try {
            (_b = (_a = variable).setVariableCodeSyntax) === null || _b === void 0 ? void 0 : _b.call(_a, "WEB", "var(".concat(spec.cssName, ")"));
        }
        catch (error) {
            warn("Could not set code syntax for ".concat(spec.cssName, ": ").concat(formatError(error)));
        }
        try {
            setVariablePluginData(variable, tokenPluginDataKey, spec.cssName);
            if (tokenPluginDataKey !== LEGACY_CM_TOKEN_PLUGIN_DATA_KEY) {
                setVariablePluginData(variable, LEGACY_CM_TOKEN_PLUGIN_DATA_KEY, spec.cssName);
            }
        }
        catch (error) {
            warn("Could not set plugin data for ".concat(spec.cssName, ": ").concat(formatError(error)));
        }
    }
    function setVariableValue(variable, modeId, spec, aliasTarget) {
        if (spec.alias) {
            if (!aliasTarget) {
                throw new Error("Missing alias target ".concat(spec.alias, " for ").concat(spec.cssName));
            }
            variable.setValueForMode(modeId, {
                id: aliasTarget.id,
                type: "VARIABLE_ALIAS",
            });
            return;
        }
        variable.setValueForMode(modeId, normalizeVariableValue(spec));
    }
    function createNode(spec_1, path_1) {
        return __awaiter(this, arguments, void 0, function (spec, path, options) {
            var existing, instance, node, _a, _b;
            var _c;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (!(options.reuseComponents &&
                            !options.isRoot &&
                            ((_c = spec.component) === null || _c === void 0 ? void 0 : _c.key) &&
                            canCreateComponentDefinition(spec))) return [3 /*break*/, 3];
                        return [4 /*yield*/, findLocalComponent(spec.component)];
                    case 1:
                        existing = _d.sent();
                        if (!(!existing ||
                            getNodePluginData(existing, COMPONENT_SPEC_HASH_PLUGIN_DATA_KEY) ===
                                getComponentSpecHash(spec))) return [3 /*break*/, 3];
                        return [4 /*yield*/, createComponentInstance(spec, spec.component, path, options)];
                    case 2:
                        instance = _d.sent();
                        stats.nodesCreated += 1;
                        return [2 /*return*/, instance];
                    case 3:
                        if (!(spec.kind === "text")) return [3 /*break*/, 5];
                        return [4 /*yield*/, createTextNode(spec, path, options)];
                    case 4:
                        _a = _d.sent();
                        return [3 /*break*/, 9];
                    case 5:
                        if (!(spec.kind === "image" || spec.kind === "svg")) return [3 /*break*/, 6];
                        _b = createImageNode(spec, path);
                        return [3 /*break*/, 8];
                    case 6: return [4 /*yield*/, createFrameNode(spec, path, options, false)];
                    case 7:
                        _b = _d.sent();
                        _d.label = 8;
                    case 8:
                        _a = _b;
                        _d.label = 9;
                    case 9:
                        node = _a;
                        node.x = safeNumber(spec.styles.x, 0);
                        node.y = safeNumber(spec.styles.y, 0);
                        stats.nodesCreated += 1;
                        return [2 /*return*/, node];
                }
            });
        });
    }
    function createFrameNode(spec, path, options, asComponent) {
        return __awaiter(this, void 0, void 0, function () {
            var node, styles, bindings, _i, _a, childSpec, childOptions, child;
            var _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        node = asComponent ? figma.createComponent() : figma.createFrame();
                        styles = spec.styles;
                        bindings = (_b = spec.bindings) !== null && _b !== void 0 ? _b : {};
                        node.name = spec.name || "frame";
                        safeResize(node, styles.width, styles.height, path);
                        node.clipsContent = styles.overflow === "hidden" || styles.overflow === "clip";
                        node.opacity = clamp(safeNumber(styles.opacity, 1), 0, 1);
                        setFrameFills(node, styles, bindings, path);
                        setStrokes(node, styles, bindings, path);
                        applyRadius(node, styles, bindings, path);
                        applyAutoLayout(node, styles, bindings, path);
                        safeBind(node, "width", bindings.width, path);
                        safeBind(node, "height", bindings.height, path);
                        safeBind(node, "opacity", bindings.opacity, path);
                        if (!styles.borderSides) {
                            safeBind(node, "strokeWeight", bindings.borderWidth, path);
                        }
                        _i = 0, _a = (_c = spec.children) !== null && _c !== void 0 ? _c : [];
                        _d.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                        childSpec = _a[_i];
                        childOptions = __assign(__assign({}, options), { inferredTextAlignHorizontal: childSpec.kind === "text"
                                ? getInferredChildTextAlignHorizontal(node)
                                : undefined, isRoot: false });
                        return [4 /*yield*/, createNode(childSpec, "".concat(path, "/").concat(childSpec.name), childOptions)];
                    case 2:
                        child = _d.sent();
                        node.appendChild(child);
                        applyAutoLayoutChildSizing(node, child, childSpec, "".concat(path, "/").concat(childSpec.name));
                        applyChildPlacement(node, child, childSpec, "".concat(path, "/").concat(childSpec.name));
                        if (child.type === "TEXT") {
                            applyTextAlignHorizontal(child, childSpec, childOptions, "".concat(path, "/").concat(childSpec.name));
                        }
                        if (node.layoutMode === "NONE") {
                            child.x = safeNumber(childSpec.styles.x, 0);
                            child.y = safeNumber(childSpec.styles.y, 0);
                        }
                        _d.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, node];
                }
            });
        });
    }
    function ensureComponentDefinition(spec_1, component_1, path_1) {
        return __awaiter(this, arguments, void 0, function (spec, component, path, options) {
            var existing, componentSet, componentNode, _a, componentSet;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, findLocalComponent(component)];
                    case 1:
                        existing = _b.sent();
                        if (!existing) return [3 /*break*/, 5];
                        if (componentDefinitionRecords.has(component.key) &&
                            getNodePluginData(existing, COMPONENT_SPEC_HASH_PLUGIN_DATA_KEY) !==
                                getComponentSpecHash(spec)) {
                            warn("Duplicate variant name \"".concat(getComponentDisplayName(component), "\" with different content at ").concat(path, "; the later design overwrote the earlier one. Give each export item a distinct figmaVariant."));
                        }
                        syncExistingFrameFromSpec(existing, spec, path);
                        return [4 /*yield*/, syncExistingFrameChildrenFromSpec(existing, spec, path, __assign(__assign({}, options), { isRoot: false, reuseComponents: true }))];
                    case 2:
                        _b.sent();
                        applyTextAlignmentFromSpec(existing, spec, options, path);
                        setNodePluginData(existing, COMPONENT_SPEC_HASH_PLUGIN_DATA_KEY, getComponentSpecHash(spec));
                        trackComponentDefinition(existing, component);
                        if (!(component.variant && options.autoAttachComponentSet !== false)) return [3 /*break*/, 4];
                        return [4 /*yield*/, attachVariantComponentToSet(existing, component)];
                    case 3:
                        componentSet = _b.sent();
                        if (componentSet) {
                            trackComponentSet(componentSet, component);
                        }
                        _b.label = 4;
                    case 4:
                        moveExistingComponentDefinitionToTargetPage(existing);
                        stats.reusedComponents += 1;
                        return [2 /*return*/, existing];
                    case 5:
                        if (!((spec.kind === "image" || spec.kind === "svg") && spec.svgText)) return [3 /*break*/, 6];
                        _a = figma.createComponentFromNode(createSvgSceneNode(spec, path));
                        return [3 /*break*/, 8];
                    case 6: return [4 /*yield*/, createFrameNode(spec, path, __assign(__assign({}, options), { autoAttachComponentSet: true, reuseComponents: true }), true)];
                    case 7:
                        _a = (_b.sent());
                        _b.label = 8;
                    case 8:
                        componentNode = _a;
                        componentNode.name = getComponentDisplayName(component);
                        tagComponentNode(componentNode, component);
                        setNodePluginData(componentNode, COMPONENT_SPEC_HASH_PLUGIN_DATA_KEY, getComponentSpecHash(spec));
                        componentRegistry.set(component.key, componentNode);
                        trackComponentDefinition(componentNode, component);
                        stats.componentsCreated += 1;
                        stats.nodesCreated += 1;
                        if (!(component.variant && options.autoAttachComponentSet !== false)) return [3 /*break*/, 10];
                        return [4 /*yield*/, attachVariantComponentToSet(componentNode, component)];
                    case 9:
                        componentSet = _b.sent();
                        if (componentSet) {
                            trackComponentSet(componentSet, component);
                            return [2 /*return*/, componentNode];
                        }
                        _b.label = 10;
                    case 10:
                        parkComponentDefinition(componentNode);
                        return [2 /*return*/, componentNode];
                }
            });
        });
    }
    function createComponentInstance(spec, component, path, options) {
        return __awaiter(this, void 0, void 0, function () {
            var componentNode, instance;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, ensureComponentDefinition(spec, component, path, options)];
                    case 1:
                        componentNode = _a.sent();
                        instance = componentNode.createInstance();
                        instance.name = component.name;
                        safeResize(instance, spec.styles.width, spec.styles.height, path);
                        instance.x = safeNumber(spec.styles.x, 0);
                        instance.y = safeNumber(spec.styles.y, 0);
                        return [2 /*return*/, instance];
                }
            });
        });
    }
    function createComponentSetFromVariants(root, fallbackName) {
        return __awaiter(this, void 0, void 0, function () {
            var componentSpecs, variantSpecs, variantGroups, variantGroup, componentSpec, existingSet, _i, variantGroup_1, entry, componentNodes, _a, variantGroup_2, entry, componentNode, componentSet;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        componentSpecs = collectComponentDefinitionSpecs(root, root.name);
                        variantSpecs = componentSpecs.filter(function (entry) {
                            return Boolean(entry.component.variant);
                        });
                        variantGroups = groupVariantComponentSpecs(variantSpecs);
                        variantGroup = chooseVariantGroup(variantGroups, fallbackName);
                        if (!variantGroup) {
                            componentSpec = chooseComponentDefinitionSpec(componentSpecs, fallbackName);
                            if (componentSpec) {
                                return [2 /*return*/, ensureComponentDefinition(componentSpec.spec, componentSpec.component, componentSpec.path, { autoAttachComponentSet: true, reuseComponents: true })];
                            }
                            return [2 /*return*/, createNode(root, root.name, {
                                    isRoot: true,
                                    reuseComponents: false,
                                })];
                        }
                        return [4 /*yield*/, findExistingComponentSet(variantGroup.map(function (entry) { return entry.component; }))];
                    case 1:
                        existingSet = _b.sent();
                        if (!existingSet) return [3 /*break*/, 6];
                        _i = 0, variantGroup_1 = variantGroup;
                        _b.label = 2;
                    case 2:
                        if (!(_i < variantGroup_1.length)) return [3 /*break*/, 5];
                        entry = variantGroup_1[_i];
                        return [4 /*yield*/, ensureComponentDefinition(entry.spec, entry.component, entry.path, {
                                autoAttachComponentSet: true,
                                reuseComponents: true,
                            })];
                    case 3:
                        _b.sent();
                        _b.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5:
                        attachStandaloneVariantComponentsToSet(existingSet, variantGroup[0].component);
                        tagVariantComponentSet(existingSet, variantGroup[0].component);
                        normalizeComponentSetVariantNames(existingSet, variantGroup[0].component);
                        layoutVariantComponentSet(existingSet);
                        trackComponentSet(existingSet, variantGroup[0].component);
                        return [2 /*return*/, existingSet];
                    case 6:
                        componentNodes = [];
                        _a = 0, variantGroup_2 = variantGroup;
                        _b.label = 7;
                    case 7:
                        if (!(_a < variantGroup_2.length)) return [3 /*break*/, 10];
                        entry = variantGroup_2[_a];
                        return [4 /*yield*/, ensureComponentDefinition(entry.spec, entry.component, entry.path, {
                                autoAttachComponentSet: false,
                                reuseComponents: true,
                            })];
                    case 8:
                        componentNode = _b.sent();
                        prepareVariantNodeForComponentSet(componentNode, entry.component);
                        componentNodes.push(componentNode);
                        _b.label = 9;
                    case 9:
                        _a++;
                        return [3 /*break*/, 7];
                    case 10:
                        try {
                            componentSet = figma.combineAsVariants(getStandaloneVariantNodesForNewSet(componentNodes, variantGroup[0].component), figma.currentPage);
                            componentSet.name = variantGroup[0].component.name || fallbackName;
                            tagVariantComponentSet(componentSet, variantGroup[0].component);
                            normalizeComponentSetVariantNames(componentSet, variantGroup[0].component);
                            layoutVariantComponentSet(componentSet);
                            trackComponentSet(componentSet, variantGroup[0].component);
                            return [2 /*return*/, componentSet];
                        }
                        catch (error) {
                            warn("Could not combine component variants: ".concat(formatError(error)));
                            return [2 /*return*/, createNode(root, root.name, {
                                    isRoot: true,
                                    reuseComponents: true,
                                })];
                        }
                        return [2 /*return*/];
                }
            });
        });
    }
    function syncExistingFrameFromSpec(node, spec, path) {
        var _a;
        if (spec.kind !== "frame")
            return;
        var styles = spec.styles;
        var bindings = (_a = spec.bindings) !== null && _a !== void 0 ? _a : {};
        safeResize(node, styles.width, styles.height, path);
        node.clipsContent = styles.overflow === "hidden" || styles.overflow === "clip";
        node.opacity = clamp(safeNumber(styles.opacity, 1), 0, 1);
        setFrameFills(node, styles, bindings, path);
        setStrokes(node, styles, bindings, path);
        applyRadius(node, styles, bindings, path);
        applyAutoLayout(node, styles, bindings, path);
        safeBind(node, "width", bindings.width, path);
        safeBind(node, "height", bindings.height, path);
        safeBind(node, "opacity", bindings.opacity, path);
        if (!styles.borderSides) {
            safeBind(node, "strokeWeight", bindings.borderWidth, path);
        }
    }
    function syncExistingFrameChildrenFromSpec(node, spec, path, options) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, _a, child, _b, _c, childSpec, childOptions, childPath, child;
            var _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        if (spec.kind !== "frame")
                            return [2 /*return*/];
                        for (_i = 0, _a = __spreadArray([], node.children, true); _i < _a.length; _i++) {
                            child = _a[_i];
                            child.remove();
                        }
                        _b = 0, _c = (_d = spec.children) !== null && _d !== void 0 ? _d : [];
                        _e.label = 1;
                    case 1:
                        if (!(_b < _c.length)) return [3 /*break*/, 4];
                        childSpec = _c[_b];
                        childOptions = __assign(__assign({}, options), { inferredTextAlignHorizontal: childSpec.kind === "text"
                                ? getInferredChildTextAlignHorizontal(node)
                                : undefined, isRoot: false });
                        childPath = "".concat(path, "/").concat(childSpec.name);
                        return [4 /*yield*/, createNode(childSpec, childPath, childOptions)];
                    case 2:
                        child = _e.sent();
                        node.appendChild(child);
                        applyAutoLayoutChildSizing(node, child, childSpec, childPath);
                        applyChildPlacement(node, child, childSpec, childPath);
                        if (child.type === "TEXT") {
                            applyTextAlignHorizontal(child, childSpec, childOptions, childPath);
                        }
                        if (node.layoutMode === "NONE") {
                            child.x = safeNumber(childSpec.styles.x, 0);
                            child.y = safeNumber(childSpec.styles.y, 0);
                        }
                        _e.label = 3;
                    case 3:
                        _b++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    }
    function collectComponentDefinitionSpecs(node, path, depth) {
        var _a, _b;
        if (depth === void 0) { depth = 0; }
        var entries = [];
        if (((_a = node.component) === null || _a === void 0 ? void 0 : _a.key) && canCreateComponentDefinition(node)) {
            entries.push({ component: node.component, depth: depth, path: path, spec: node });
        }
        for (var _i = 0, _c = (_b = node.children) !== null && _b !== void 0 ? _b : []; _i < _c.length; _i++) {
            var child = _c[_i];
            entries.push.apply(entries, collectComponentDefinitionSpecs(child, "".concat(path, "/").concat(child.name), depth + 1));
        }
        return entries;
    }
    function collectPageComponentDefinitionSpecs(root) {
        var seen = new Set();
        return collectComponentDefinitionSpecs(root, root.name).filter(function (entry) {
            if (entry.depth === 0)
                return false;
            if (seen.has(entry.component.key))
                return false;
            seen.add(entry.component.key);
            return true;
        });
    }
    function preparePageComponentDefinitions(root) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, _a, entry;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (artifactKind !== "page")
                            return [2 /*return*/];
                        _i = 0, _a = collectPageComponentDefinitionSpecs(root);
                        _b.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                        entry = _a[_i];
                        return [4 /*yield*/, ensureComponentDefinition(entry.spec, entry.component, entry.path, {
                                reuseComponents: true,
                            })];
                    case 2:
                        _b.sent();
                        stats.componentDefinitionsPrepared =
                            safeNumber(stats.componentDefinitionsPrepared, 0) + 1;
                        _b.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    }
    function chooseComponentDefinitionSpec(entries, fallbackName) {
        return __spreadArray([], entries, true).sort(function (a, b) {
            var preferredDelta = Number(componentDefinitionMatchesFallback(b, fallbackName)) -
                Number(componentDefinitionMatchesFallback(a, fallbackName));
            if (preferredDelta !== 0)
                return preferredDelta;
            var depthDelta = a.depth - b.depth;
            if (depthDelta !== 0)
                return depthDelta;
            return getComponentSpecArea(b) - getComponentSpecArea(a);
        })[0];
    }
    function componentDefinitionMatchesFallback(entry, fallbackName) {
        var expectedName = normalizeComponentIdentity(fallbackName);
        if (!expectedName)
            return false;
        return (normalizeComponentIdentity(entry.component.name) === expectedName ||
            normalizeComponentIdentity(entry.component.sourceName) === expectedName);
    }
    function getComponentSpecArea(entry) {
        return (Math.max(1, safeNumber(entry.spec.styles.width, 1)) *
            Math.max(1, safeNumber(entry.spec.styles.height, 1)));
    }
    function chooseVariantGroup(groups, fallbackName) {
        return groups
            .filter(function (group) { return group.length >= 2; })
            .sort(function (a, b) {
            var preferredDelta = Number(isPreferredVariantGroup(b, fallbackName)) -
                Number(isPreferredVariantGroup(a, fallbackName));
            if (preferredDelta !== 0)
                return preferredDelta;
            var depthDelta = getVariantGroupDepth(a) - getVariantGroupDepth(b);
            if (depthDelta !== 0)
                return depthDelta;
            return b.length - a.length;
        })[0];
    }
    function isPreferredVariantGroup(group, fallbackName) {
        var expectedName = normalizeComponentIdentity(fallbackName);
        if (!expectedName)
            return false;
        return group.some(function (entry) {
            return (normalizeComponentIdentity(entry.component.name) === expectedName ||
                normalizeComponentIdentity(entry.component.sourceName) === expectedName);
        });
    }
    function getVariantGroupDepth(group) {
        return Math.min.apply(Math, group.map(function (entry) { return entry.depth; }));
    }
    function normalizeComponentIdentity(value) {
        return String(value !== null && value !== void 0 ? value : "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "");
    }
    function groupVariantComponentSpecs(entries) {
        var _a;
        var groups = new Map();
        for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
            var entry = entries_1[_i];
            var groupKey = entry.component.sourceName || entry.component.name;
            var group = (_a = groups.get(groupKey)) !== null && _a !== void 0 ? _a : [];
            group.push(entry);
            groups.set(groupKey, group);
        }
        return Array.from(groups.values());
    }
    function findExistingComponentSet(components) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, components_1, component, existing;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _i = 0, components_1 = components;
                        _b.label = 1;
                    case 1:
                        if (!(_i < components_1.length)) return [3 /*break*/, 4];
                        component = components_1[_i];
                        return [4 /*yield*/, findLocalComponent(component)];
                    case 2:
                        existing = _b.sent();
                        if (((_a = existing === null || existing === void 0 ? void 0 : existing.parent) === null || _a === void 0 ? void 0 : _a.type) === "COMPONENT_SET") {
                            return [2 /*return*/, existing.parent];
                        }
                        _b.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, components[0] ? findVariantComponentSet(components[0]) : undefined];
                }
            });
        });
    }
    function findLocalComponent(component) {
        return __awaiter(this, void 0, void 0, function () {
            var cached, found;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        cached = componentRegistry.get(component.key);
                        if (cached)
                            return [2 /*return*/, cached];
                        return [4 /*yield*/, figma.loadAllPagesAsync()];
                    case 1:
                        _a.sent();
                        found = collectComponentNodes(figma.root).find(function (node) {
                            if (getNodePluginData(node, componentPluginDataKey) === component.key) {
                                return true;
                            }
                            return componentNodeMatchesReference(node, component);
                        });
                        if (found)
                            componentRegistry.set(component.key, found);
                        return [2 /*return*/, found];
                }
            });
        });
    }
    function organizeComponentDependencySections(rootNode, targetPage) {
        var excludedNodeIds = collectSceneNodeIds(rootNode);
        var targets = collectDependencySectionTargets(excludedNodeIds);
        return targets.map(function (target) {
            return placeNodeInComponentSection(target.node, targetPage, target);
        });
    }
    function collectDependencySectionTargets(excludedNodeIds) {
        var targets = new Map();
        for (var _i = 0, _a = Array.from(componentDefinitionRecords.values()); _i < _a.length; _i++) {
            var record = _a[_i];
            var node = getComponentDefinitionSectionNode(record.node);
            if (shouldSkipComponentSectionNode(node, excludedNodeIds))
                continue;
            var sectionKey = getComponentReferenceSectionKey(record.component);
            var existing = targets.get(sectionKey);
            if ((existing === null || existing === void 0 ? void 0 : existing.node.type) === "COMPONENT_SET")
                continue;
            targets.set(sectionKey, {
                key: sectionKey,
                name: getComponentReferenceSectionName(record.component),
                node: node,
                role: "dependency",
            });
        }
        for (var _b = 0, _c = Array.from(componentSetRecords.values()); _b < _c.length; _b++) {
            var record = _c[_b];
            if (shouldSkipComponentSectionNode(record.node, excludedNodeIds))
                continue;
            var sectionKey = getComponentReferenceSectionKey(record.component);
            targets.set(sectionKey, {
                key: sectionKey,
                name: getComponentReferenceSectionName(record.component),
                node: record.node,
                role: "dependency",
            });
        }
        return Array.from(targets.values()).sort(function (a, b) {
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        });
    }
    function trackComponentDefinition(node, component) {
        var _a;
        componentDefinitionRecords.set(component.key, { component: component, node: node });
        if (((_a = node.parent) === null || _a === void 0 ? void 0 : _a.type) === "COMPONENT_SET") {
            trackComponentSet(node.parent, component);
        }
    }
    function trackComponentSet(node, component) {
        componentSetRecords.set(getComponentReferenceSectionKey(component), {
            component: component,
            node: node,
        });
    }
    function getComponentDefinitionSectionNode(node) {
        var _a;
        return ((_a = node.parent) === null || _a === void 0 ? void 0 : _a.type) === "COMPONENT_SET" ? node.parent : node;
    }
    function shouldSkipComponentSectionNode(node, excludedNodeIds) {
        return node.removed || excludedNodeIds.has(node.id);
    }
    function attachVariantComponentToSet(componentNode, component) {
        return __awaiter(this, void 0, void 0, function () {
            var existingSet, siblingComponents, targetParent, variantNodes, _i, variantNodes_1, node, componentSet;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, findVariantComponentSet(component)];
                    case 1:
                        existingSet = _b.sent();
                        if (existingSet) {
                            prepareVariantNodeForComponentSet(componentNode, component);
                            if (componentNode.parent === existingSet) {
                                tagVariantComponentSet(existingSet, component);
                                normalizeComponentSetVariantNames(existingSet, component);
                                layoutVariantComponentSet(existingSet);
                                moveComponentDefinitionNodeToTargetPage(existingSet);
                                return [2 /*return*/, existingSet];
                            }
                            try {
                                existingSet.appendChild(componentNode);
                                tagVariantComponentSet(existingSet, component);
                                normalizeComponentSetVariantNames(existingSet, component);
                                layoutVariantComponentSet(existingSet);
                                moveComponentDefinitionNodeToTargetPage(existingSet);
                                return [2 /*return*/, existingSet];
                            }
                            catch (error) {
                                warn("Could not append ".concat(component.key, " to component set ").concat(existingSet.name, ": ").concat(formatError(error)));
                            }
                        }
                        if (artifactKind === "page") {
                            moveComponentDefinitionNodeToTargetPage(componentNode);
                        }
                        siblingComponents = findStandaloneVariantComponents(component).filter(function (node) { return node !== componentNode; });
                        if (siblingComponents.length === 0)
                            return [2 /*return*/, undefined];
                        try {
                            targetParent = (_a = getAncestorPage(componentNode)) !== null && _a !== void 0 ? _a : figma.currentPage;
                            variantNodes = __spreadArray(__spreadArray([], siblingComponents, true), [componentNode], false);
                            for (_i = 0, variantNodes_1 = variantNodes; _i < variantNodes_1.length; _i++) {
                                node = variantNodes_1[_i];
                                prepareVariantNodeForComponentSet(node, getStoredComponentReference(node, component));
                                if (node.parent !== targetParent) {
                                    targetParent.appendChild(node);
                                }
                            }
                            componentSet = figma.combineAsVariants(variantNodes, targetParent);
                            componentSet.name = component.name;
                            tagVariantComponentSet(componentSet, component);
                            normalizeComponentSetVariantNames(componentSet, component);
                            layoutVariantComponentSet(componentSet);
                            moveComponentDefinitionNodeToTargetPage(componentSet);
                            return [2 /*return*/, componentSet];
                        }
                        catch (error) {
                            warn("Could not combine ".concat(component.name, " variants into a component set: ").concat(formatError(error)));
                            return [2 /*return*/, undefined];
                        }
                        return [2 /*return*/];
                }
            });
        });
    }
    function findVariantComponentSet(component) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, figma.loadAllPagesAsync()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, collectComponentSetNodes(figma.root).find(function (node) {
                                return componentSetMatchesVariantGroup(node, component);
                            })];
                }
            });
        });
    }
    function findStandaloneVariantComponents(component) {
        return collectComponentNodes(figma.root).filter(function (node) {
            var _a;
            return (((_a = node.parent) === null || _a === void 0 ? void 0 : _a.type) !== "COMPONENT_SET" &&
                componentNodeMatchesVariantGroup(node, component));
        });
    }
    function collectComponentNodes(node) {
        var components = [];
        if (node.type === "COMPONENT") {
            components.push(node);
        }
        var children = node.children;
        if (children) {
            for (var _i = 0, children_1 = children; _i < children_1.length; _i++) {
                var child = children_1[_i];
                components.push.apply(components, collectComponentNodes(child));
            }
        }
        return components;
    }
    function collectComponentSetNodes(node) {
        var componentSets = [];
        if (node.type === "COMPONENT_SET") {
            componentSets.push(node);
        }
        var children = node.children;
        if (children) {
            for (var _i = 0, children_2 = children; _i < children_2.length; _i++) {
                var child = children_2[_i];
                componentSets.push.apply(componentSets, collectComponentSetNodes(child));
            }
        }
        return componentSets;
    }
    function componentSetMatchesVariantGroup(node, component) {
        if (normalizeComponentIdentity(getNodePluginData(node, "storybookComponentSource")) ===
            normalizeComponentIdentity(component.sourceName || component.name) ||
            normalizeComponentIdentity(getNodePluginData(node, "storybookComponentName")) ===
                normalizeComponentIdentity(component.name)) {
            return true;
        }
        if (normalizeComponentIdentity(node.name) ===
            normalizeComponentIdentity(component.name) ||
            normalizeComponentIdentity(node.name) ===
                normalizeComponentIdentity(component.sourceName)) {
            return true;
        }
        return node.children.some(function (child) {
            return (child.type === "COMPONENT" &&
                componentNodeMatchesVariantGroup(child, component));
        });
    }
    function componentNodeMatchesReference(node, component) {
        var _a;
        var variantDisplayName = getVariantPropertyDisplayName(component);
        return (node.name === getComponentDisplayName(component) ||
            (Boolean(variantDisplayName) &&
                node.name === variantDisplayName &&
                ((_a = node.parent) === null || _a === void 0 ? void 0 : _a.type) === "COMPONENT_SET" &&
                componentSetMatchesVariantGroup(node.parent, component)) ||
            (!component.variant && node.name === component.name));
    }
    function componentNodeMatchesVariantGroup(node, component) {
        var expectedSource = normalizeComponentIdentity(component.sourceName || component.name);
        var expectedName = normalizeComponentIdentity(component.name);
        var source = normalizeComponentIdentity(getNodePluginData(node, "storybookComponentSource"));
        var name = normalizeComponentIdentity(getNodePluginData(node, "storybookComponentName"));
        if (source && source === expectedSource)
            return true;
        if (name && name === expectedName)
            return true;
        var baseName = normalizeComponentIdentity(node.name.split(",")[0]);
        return baseName === expectedName || baseName === expectedSource;
    }
    function tagComponentNode(node, component) {
        setNodePluginData(node, componentPluginDataKey, component.key);
        setNodePluginData(node, "storybookComponentName", component.name);
        setNodePluginData(node, "storybookComponentSource", component.sourceName || component.key);
        if (component.variant) {
            setNodePluginData(node, "storybookComponentVariant", component.variant);
        }
        if (component.variantProperties) {
            setNodePluginData(node, "storybookComponentVariantProperties", JSON.stringify(component.variantProperties));
        }
    }
    function tagVariantComponentSet(node, component) {
        setNodePluginData(node, "storybookComponentName", component.name);
        setNodePluginData(node, "storybookComponentSource", component.sourceName || component.name);
    }
    function attachStandaloneVariantComponentsToSet(componentSet, component) {
        var existingVariantIdentities = getComponentSetVariantIdentities(componentSet);
        for (var _i = 0, _a = findStandaloneVariantComponents(component); _i < _a.length; _i++) {
            var node = _a[_i];
            var nodeComponent = getStoredComponentReference(node, component);
            var variantIdentity = getComponentVariantIdentity(nodeComponent);
            if (variantIdentity && existingVariantIdentities.has(variantIdentity))
                continue;
            try {
                prepareVariantNodeForComponentSet(node, nodeComponent);
                componentSet.appendChild(node);
                if (variantIdentity)
                    existingVariantIdentities.add(variantIdentity);
            }
            catch (error) {
                warn("Could not attach existing standalone variant ".concat(node.name, " to ").concat(componentSet.name, ": ").concat(formatError(error)));
            }
        }
    }
    function getStandaloneVariantNodesForNewSet(componentNodes, component) {
        var nodes = uniqueComponentNodes(__spreadArray(__spreadArray([], findStandaloneVariantComponents(component), true), componentNodes, true));
        for (var _i = 0, nodes_1 = nodes; _i < nodes_1.length; _i++) {
            var node = nodes_1[_i];
            prepareVariantNodeForComponentSet(node, getStoredComponentReference(node, component));
            if (node.parent !== figma.currentPage) {
                figma.currentPage.appendChild(node);
            }
        }
        return nodes;
    }
    function uniqueComponentNodes(nodes) {
        var seen = new Set();
        var result = [];
        for (var _i = 0, nodes_2 = nodes; _i < nodes_2.length; _i++) {
            var node = nodes_2[_i];
            if (seen.has(node.id))
                continue;
            seen.add(node.id);
            result.push(node);
        }
        return result;
    }
    function normalizeComponentSetVariantNames(componentSet, fallbackComponent) {
        for (var _i = 0, _a = componentSet.children; _i < _a.length; _i++) {
            var child = _a[_i];
            if (child.type !== "COMPONENT")
                continue;
            prepareVariantNodeForComponentSet(child, getStoredComponentReference(child, fallbackComponent));
        }
    }
    function prepareVariantNodeForComponentSet(node, component) {
        var variantName = getVariantPropertyDisplayName(component);
        if (variantName) {
            node.name = variantName;
        }
        tagComponentNode(node, component);
    }
    function getStoredComponentReference(node, fallbackComponent) {
        var key = getNodePluginData(node, componentPluginDataKey) || fallbackComponent.key;
        var name = getNodePluginData(node, "storybookComponentName") || fallbackComponent.name;
        var sourceName = getNodePluginData(node, "storybookComponentSource") ||
            fallbackComponent.sourceName ||
            name;
        var variant = getNodePluginData(node, "storybookComponentVariant") ||
            fallbackComponent.variant;
        var variantProperties = getStoredVariantProperties(node) || fallbackComponent.variantProperties;
        return {
            key: key,
            name: name,
            sourceName: sourceName,
            variant: variant,
            variantProperties: variantProperties,
        };
    }
    function getComponentSetVariantIdentities(componentSet) {
        var identities = new Set();
        for (var _i = 0, _a = componentSet.children; _i < _a.length; _i++) {
            var child = _a[_i];
            if (child.type !== "COMPONENT")
                continue;
            var identity = getComponentVariantIdentity(getStoredComponentReference(child, {
                key: "",
                name: componentSet.name,
                sourceName: componentSet.name,
            }));
            if (identity)
                identities.add(identity);
        }
        return identities;
    }
    function getComponentVariantIdentity(component) {
        var variantProperties = component.variantProperties && Object.keys(component.variantProperties).length > 0
            ? component.variantProperties
            : component.variant
                ? { Variant: component.variant }
                : undefined;
        if (!variantProperties)
            return undefined;
        return Object.keys(variantProperties)
            .sort(function (a, b) { return a.localeCompare(b); })
            .map(function (name) { return "".concat(name, ":").concat(variantProperties[name]); })
            .join("|");
    }
    function layoutVariantComponentSet(node) {
        var variantNodes = sortVariantComponents(node.children.filter(function (child) { return child.type === "COMPONENT"; }));
        if (variantNodes.length === 0)
            return;
        var grid = getComponentSetGridMetrics(variantNodes);
        var rows = Math.ceil(variantNodes.length / grid.columns);
        var width = grid.columns * grid.cellWidth + (grid.columns - 1) * grid.gap;
        var height = rows * grid.cellHeight + (rows - 1) * grid.gap;
        for (var index = 0; index < variantNodes.length; index += 1) {
            var child = variantNodes[index];
            var column = index % grid.columns;
            var row = Math.floor(index / grid.columns);
            var offsetX = Math.max(0, (grid.cellWidth - safeNumber(child.width, 0)) / 2);
            var offsetY = Math.max(0, (grid.cellHeight - safeNumber(child.height, 0)) / 2);
            child.x = column * (grid.cellWidth + grid.gap) + offsetX;
            child.y = row * (grid.cellHeight + grid.gap) + offsetY;
        }
        safeResizeWithoutConstraints(node, Math.max(1, width), Math.max(1, height), "".concat(node.name, ".componentSetGrid"));
    }
    function sortVariantComponents(children) {
        return __spreadArray([], children, true).sort(function (a, b) {
            return getVariantComponentSortKey(a).localeCompare(getVariantComponentSortKey(b), undefined, { numeric: true, sensitivity: "base" });
        });
    }
    function getVariantComponentSortKey(node) {
        var variantProperties = getReadableVariantProperties(node);
        if (variantProperties) {
            return Object.keys(variantProperties)
                .sort(function (a, b) { return a.localeCompare(b); })
                .map(function (name) { return "".concat(name, ":").concat(variantProperties[name]); })
                .join("|");
        }
        return getNodePluginData(node, "storybookComponentVariant") || node.name;
    }
    function getReadableVariantProperties(node) {
        var _a;
        var storedVariantProperties = getStoredVariantProperties(node);
        try {
            return (_a = node.variantProperties) !== null && _a !== void 0 ? _a : storedVariantProperties;
        }
        catch (error) {
            if (!warnedVariantPropertyNodeIds.has(node.id)) {
                warnedVariantPropertyNodeIds.add(node.id);
                warn("Could not read Figma variant properties for ".concat(node.name, "; using Storybook variant metadata instead: ").concat(formatError(error)));
            }
            return storedVariantProperties;
        }
    }
    function getStoredVariantProperties(node) {
        var rawValue = getNodePluginData(node, "storybookComponentVariantProperties");
        if (!rawValue)
            return undefined;
        try {
            var parsed = JSON.parse(rawValue);
            if (!isRecord(parsed))
                return undefined;
            var result = {};
            for (var _i = 0, _a = Object.entries(parsed); _i < _a.length; _i++) {
                var _b = _a[_i], key = _b[0], value = _b[1];
                if (typeof value === "string") {
                    result[key] = value;
                }
            }
            return Object.keys(result).length > 0 ? result : undefined;
        }
        catch (_c) {
            return undefined;
        }
    }
    function getComponentSetGridMetrics(children) {
        var maxWidth = Math.max.apply(Math, children.map(function (child) { return safeNumber(child.width, 1); }));
        var maxHeight = Math.max.apply(Math, children.map(function (child) { return safeNumber(child.height, 1); }));
        var maxSize = Math.max(maxWidth, maxHeight);
        var maxColumns = maxSize <= COMPONENT_SET_GRID_COMPACT_MAX_SIZE
            ? COMPONENT_SET_GRID_COMPACT_COLUMNS
            : maxSize <= COMPONENT_SET_GRID_MEDIUM_MAX_SIZE
                ? COMPONENT_SET_GRID_MEDIUM_COLUMNS
                : 1;
        return {
            cellHeight: Math.max(COMPONENT_SET_GRID_MIN_CELL_HEIGHT, maxHeight),
            cellWidth: Math.max(COMPONENT_SET_GRID_MIN_CELL_WIDTH, maxWidth),
            columns: Math.max(1, Math.min(maxColumns, children.length)),
            gap: COMPONENT_SET_GRID_GAP,
        };
    }
    function parkComponentDefinition(node) {
        if (artifactKind === "page") {
            moveComponentDefinitionNodeToTargetPage(getComponentDefinitionSectionNode(node));
            return;
        }
        var rootWidth = safeNumber(payload.root.styles.width, 0);
        node.x = rootWidth + 80;
        node.y = stats.componentsCreated * 24;
    }
    function getComponentDefinitionParentPage() {
        var _a, _b;
        if (artifactKind !== "page")
            return figma.currentPage;
        var pageName = ((_b = (_a = payload.componentSystem) === null || _a === void 0 ? void 0 : _a.componentsPageName) === null || _b === void 0 ? void 0 : _b.trim()) || COMPONENTS_PAGE_NAME;
        var existing = figma.root.children.find(function (page) { return page.name.toLowerCase() === pageName.toLowerCase(); });
        if (existing)
            return existing;
        var page = figma.createPage();
        page.name = pageName;
        return page;
    }
    function getNextComponentDefinitionY(page) {
        if (componentDefinitionOffsetY === 0 && page.children.length > 0) {
            componentDefinitionOffsetY = page.children.reduce(function (maxBottom, child) {
                var childNode = child;
                var bottom = safeNumber(childNode.y, 0) + safeNumber(childNode.height, 0);
                return Math.max(maxBottom, bottom);
            }, 0);
            if (componentDefinitionOffsetY > 0)
                componentDefinitionOffsetY += 24;
        }
        return componentDefinitionOffsetY;
    }
    function moveComponentDefinitionNodeToTargetPage(node) {
        var _a;
        if (artifactKind !== "page")
            return;
        var parentPage = getComponentDefinitionParentPage();
        if (((_a = getAncestorPage(node)) === null || _a === void 0 ? void 0 : _a.id) === parentPage.id)
            return;
        var nextY = getNextComponentDefinitionY(parentPage);
        parentPage.appendChild(node);
        node.x = 0;
        node.y = nextY;
        componentDefinitionOffsetY = nextY + safeNumber(node.height, 0) + 24;
    }
    function moveExistingComponentDefinitionToTargetPage(componentNode) {
        if (artifactKind !== "page")
            return;
        moveComponentDefinitionNodeToTargetPage(getComponentDefinitionSectionNode(componentNode));
    }
    function getAncestorPage(node) {
        var parent = node.parent;
        while (parent) {
            if (parent.type === "PAGE")
                return parent;
            parent = parent.parent;
        }
        return undefined;
    }
    function createTextNode(spec, path, options) {
        return __awaiter(this, void 0, void 0, function () {
            var node, styles, bindings, _a;
            var _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        node = figma.createText();
                        styles = spec.styles;
                        bindings = (_b = spec.bindings) !== null && _b !== void 0 ? _b : {};
                        node.name = spec.name || "text";
                        _a = node;
                        return [4 /*yield*/, loadTextFont(styles, path)];
                    case 1:
                        _a.fontName = _e.sent();
                        node.characters = (_c = spec.text) !== null && _c !== void 0 ? _c : "";
                        node.fontSize = safeNumber(styles.fontSize, 14);
                        node.textAutoResize = "NONE";
                        applyTextAlignHorizontal(node, spec, options, path);
                        applyTextAlignVertical(node, styles.textAlignVertical, path);
                        if (typeof styles.lineHeight === "number") {
                            node.lineHeight = {
                                unit: "PIXELS",
                                value: styles.lineHeight,
                            };
                        }
                        node.fills = [solidPaint(styles.color, bindings.textColor, "".concat(path, ".textColor"))];
                        safeResize(node, styles.width, styles.height, path);
                        applyTextAutoResize(node, styles.textAutoResize, path);
                        applyTextTruncation(node, styles, path);
                        applyTextAlignHorizontal(node, spec, options, path);
                        safeBind(node, "width", bindings.width, path);
                        safeBind(node, "height", bindings.height, path);
                        return [4 /*yield*/, safeBindFontFamily(node, bindings.fontFamily, (_d = styles.fontWeight) !== null && _d !== void 0 ? _d : 400, path)];
                    case 2:
                        _e.sent();
                        safeBind(node, "fontSize", bindings.fontSize, path);
                        safeBind(node, "fontWeight", bindings.fontWeight, path);
                        safeBind(node, "lineHeight", bindings.lineHeight, path);
                        return [2 /*return*/, node];
                }
            });
        });
    }
    function createImageNode(spec, path) {
        var _a;
        var wrapper = figma.createFrame();
        var bindings = (_a = spec.bindings) !== null && _a !== void 0 ? _a : {};
        wrapper.name = spec.name || "image";
        wrapper.fills = [];
        wrapper.clipsContent = spec.styles.overflow === "hidden" || spec.styles.overflow === "clip";
        safeResize(wrapper, spec.styles.width, spec.styles.height, path);
        safeBind(wrapper, "width", bindings.width, path);
        safeBind(wrapper, "height", bindings.height, path);
        safeBind(wrapper, "opacity", bindings.opacity, path);
        if (spec.svgText) {
            try {
                var svgNode = figma.createNodeFromSvg(spec.svgText);
                svgNode.name = "".concat(wrapper.name, "/svg");
                safeResize(svgNode, spec.styles.width, spec.styles.height, "".concat(path, "/svg"));
                svgNode.x = 0;
                svgNode.y = 0;
                wrapper.appendChild(svgNode);
                stats.nodesCreated += 1;
            }
            catch (error) {
                warn("Could not create SVG for ".concat(path, ": ").concat(formatError(error)));
            }
        }
        else {
            warn("Image ".concat(path, " has no SVG payload; created an empty image frame."));
        }
        return wrapper;
    }
    function createSvgSceneNode(spec, path) {
        var svgNode = figma.createNodeFromSvg(spec.svgText || "");
        svgNode.name = spec.name || "svg";
        safeResize(svgNode, spec.styles.width, spec.styles.height, path);
        svgNode.x = safeNumber(spec.styles.x, 0);
        svgNode.y = safeNumber(spec.styles.y, 0);
        return svgNode;
    }
    function canCreateComponentDefinition(spec) {
        return (spec.kind === "frame" ||
            ((spec.kind === "image" || spec.kind === "svg") && Boolean(spec.svgText)));
    }
    function setFrameFills(node, styles, bindings, path) {
        if (styles.backgroundLinearGradient) {
            node.fills = [linearGradientPaint(styles.backgroundLinearGradient, path)];
            return;
        }
        if (!styles.backgroundColor && !bindings.backgroundColor) {
            node.fills = [];
            return;
        }
        node.fills = [
            solidPaint(styles.backgroundColor, bindings.backgroundColor, "".concat(path, ".fill")),
        ];
    }
    function getLinearGradientTransform(angle) {
        var normalized = ((angle % 360) + 360) % 360;
        if (normalized === 270)
            return [[-1, 0, 1], [0, 1, 0]];
        if (normalized === 180)
            return [[0, 1, 0], [-1, 0, 1]];
        if (normalized === 0)
            return [[0, -1, 1], [1, 0, 0]];
        return [[1, 0, 0], [0, 1, 0]];
    }
    function linearGradientPaint(gradient, path) {
        return {
            gradientStops: gradient.stops.map(function (stop, index) {
                return linearGradientStop(stop, index, gradient.stops.length, path);
            }),
            gradientTransform: getLinearGradientTransform(safeNumber(gradient.angle, 90)),
            type: "GRADIENT_LINEAR",
        };
    }
    function linearGradientStop(stop, index, stopCount, path) {
        var colorStop = {
            color: cloneColor(colorFromCss(stop.color)),
            position: typeof stop.position === "number"
                ? clamp(stop.position, 0, 1)
                : stopCount > 1
                    ? index / (stopCount - 1)
                    : 0,
        };
        if (!stop.token)
            return colorStop;
        var variable = registry.get(stop.token);
        if (!variable) {
            warn("Missing variable for ".concat(path, ".fill.gradientStops.").concat(index, ": ").concat(stop.token));
            return colorStop;
        }
        if (variable.resolvedType !== "COLOR") {
            warn("Cannot bind ".concat(path, ".fill.gradientStops.").concat(index, " to non-color variable ").concat(stop.token));
            return colorStop;
        }
        return __assign(__assign({}, colorStop), { boundVariables: {
                color: figma.variables.createVariableAlias(variable),
            } });
    }
    function setStrokes(node, styles, bindings, path) {
        if (styles.borderSides) {
            setBorderSideStrokes(node, styles.borderSides, bindings, path);
            return;
        }
        if (!styles.borderColor && !bindings.borderColor)
            return;
        node.strokes = [
            solidPaint(styles.borderColor, bindings.borderColor, "".concat(path, ".stroke")),
        ];
        node.strokeAlign = "INSIDE";
        if (typeof styles.borderWidth === "number") {
            node.strokeWeight = styles.borderWidth;
        }
    }
    function setBorderSideStrokes(node, sides, bindings, path) {
        var _a, _b, _c, _d;
        var sideNames = ["top", "right", "bottom", "left"];
        var firstSide = sideNames
            .map(function (side) { return sides[side]; })
            .find(function (side) { return Boolean(side); });
        if (!firstSide)
            return;
        node.strokes = [
            solidPaint(firstSide.color, bindings.borderColor, "".concat(path, ".stroke")),
        ];
        node.strokeAlign = "INSIDE";
        node.strokeTopWeight = safeNumber((_a = sides.top) === null || _a === void 0 ? void 0 : _a.width, 0);
        node.strokeRightWeight = safeNumber((_b = sides.right) === null || _b === void 0 ? void 0 : _b.width, 0);
        node.strokeBottomWeight = safeNumber((_c = sides.bottom) === null || _c === void 0 ? void 0 : _c.width, 0);
        node.strokeLeftWeight = safeNumber((_d = sides.left) === null || _d === void 0 ? void 0 : _d.width, 0);
        if (bindings.borderWidth) {
            if (sides.top)
                safeBind(node, "strokeTopWeight", bindings.borderWidth, path);
            if (sides.right)
                safeBind(node, "strokeRightWeight", bindings.borderWidth, path);
            if (sides.bottom) {
                safeBind(node, "strokeBottomWeight", bindings.borderWidth, path);
            }
            if (sides.left)
                safeBind(node, "strokeLeftWeight", bindings.borderWidth, path);
        }
    }
    function solidPaint(cssValue, tokenName, path) {
        var cssColor = colorFromCss(cssValue);
        var paint = {
            color: {
                b: cssColor.b,
                g: cssColor.g,
                r: cssColor.r,
            },
            opacity: cssColor.a,
            type: "SOLID",
        };
        if (!tokenName)
            return paint;
        var variable = registry.get(tokenName);
        if (!variable) {
            warn("Missing variable for ".concat(path, ": ").concat(tokenName));
            return paint;
        }
        if (variable.resolvedType !== "COLOR") {
            warn("Cannot bind ".concat(path, " to non-color variable ").concat(tokenName));
            return paint;
        }
        try {
            return figma.variables.setBoundVariableForPaint(paint, "color", variable);
        }
        catch (error) {
            warn("Could not bind paint ".concat(path, " to ").concat(tokenName, ": ").concat(formatError(error)));
            return paint;
        }
    }
    function applyRadius(node, styles, bindings, path) {
        if (typeof styles.radius === "number") {
            node.cornerRadius = styles.radius;
        }
        safeBindRadius(node, bindings.cornerRadius, path);
    }
    function applyAutoLayout(node, styles, bindings, path) {
        var _a, _b;
        if (!String((_a = styles.display) !== null && _a !== void 0 ? _a : "").includes("flex"))
            return;
        var primaryAxisAlignItems = mapAxisAlignment(styles.justifyContent);
        node.layoutMode = String((_b = styles.flexDirection) !== null && _b !== void 0 ? _b : "").startsWith("column")
            ? "VERTICAL"
            : "HORIZONTAL";
        var isHorizontalLayout = node.layoutMode === "HORIZONTAL";
        var horizontalSizingMode = styles.layoutSizingHorizontal === "HUG" ? "AUTO" : "FIXED";
        var verticalSizingMode = styles.layoutSizingVertical === "HUG" ? "AUTO" : "FIXED";
        node.primaryAxisSizingMode = isHorizontalLayout
            ? horizontalSizingMode
            : verticalSizingMode;
        node.counterAxisSizingMode = isHorizontalLayout
            ? verticalSizingMode
            : horizontalSizingMode;
        node.counterAxisAlignItems = mapCounterAlignment(styles.alignItems);
        node.itemSpacing =
            primaryAxisAlignItems === "SPACE_BETWEEN" ? 0 : safeNumber(styles.gap, 0);
        node.paddingLeft = safeNumber(styles.paddingLeft, 0);
        node.paddingRight = safeNumber(styles.paddingRight, 0);
        node.paddingTop = safeNumber(styles.paddingTop, 0);
        node.paddingBottom = safeNumber(styles.paddingBottom, 0);
        node.primaryAxisAlignItems = primaryAxisAlignItems;
        if (primaryAxisAlignItems !== "SPACE_BETWEEN") {
            safeBind(node, "itemSpacing", bindings.gap, path);
        }
        safeBind(node, "paddingLeft", bindings.paddingLeft, path);
        safeBind(node, "paddingRight", bindings.paddingRight, path);
        safeBind(node, "paddingTop", bindings.paddingTop, path);
        safeBind(node, "paddingBottom", bindings.paddingBottom, path);
    }
    function applyChildPlacement(parent, child, spec, path) {
        if (spec.styles.outOfFlow && parent.layoutMode !== "NONE") {
            try {
                child.layoutPositioning =
                    "ABSOLUTE";
                child.x = safeNumber(spec.styles.x, 0);
                child.y = safeNumber(spec.styles.y, 0);
            }
            catch (error) {
                warn("Could not absolutely position ".concat(path, ": ").concat(formatError(error)));
            }
        }
        applyConstraints(child, spec.styles.constraints, path);
    }
    function applyConstraints(child, constraints, path) {
        if (!constraints)
            return;
        try {
            child.constraints = {
                horizontal: constraints.horizontal,
                vertical: constraints.vertical,
            };
        }
        catch (error) {
            warn("Could not set constraints for ".concat(path, ": ").concat(formatError(error)));
        }
    }
    function applyAutoLayoutChildSizing(parent, child, spec, path) {
        if (parent.layoutMode === "NONE")
            return;
        if (spec.styles.outOfFlow)
            return;
        if (spec.styles.layoutAlign === "STRETCH") {
            try {
                child.layoutAlign = "STRETCH";
            }
            catch (error) {
                warn("Could not set ".concat(path, ".layoutAlign to STRETCH: ").concat(formatError(error)));
            }
        }
        if (spec.styles.layoutGrow === 1) {
            try {
                child.layoutGrow = 1;
            }
            catch (error) {
                warn("Could not set ".concat(path, ".layoutGrow to 1: ").concat(formatError(error)));
            }
        }
    }
    function safeBind(node, field, tokenName, path) {
        if (!tokenName)
            return false;
        var variable = registry.get(tokenName);
        if (!variable) {
            warn("Missing variable for ".concat(path, ".").concat(field, ": ").concat(tokenName));
            return false;
        }
        var target = node;
        if (typeof target.setBoundVariable !== "function") {
            warn("Node ".concat(path, " does not support variable binding for ").concat(field));
            return false;
        }
        try {
            target.setBoundVariable(field, variable);
            return true;
        }
        catch (error) {
            warn("Could not bind ".concat(path, ".").concat(field, " to ").concat(tokenName, ": ").concat(formatError(error)));
            return false;
        }
    }
    function safeBindFontFamily(node, tokenName, fontWeight, path) {
        return __awaiter(this, void 0, void 0, function () {
            var loaded;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!tokenName)
                            return [2 /*return*/, false];
                        return [4 /*yield*/, loadBoundFontFamily(tokenName, fontWeight, path)];
                    case 1:
                        loaded = _a.sent();
                        if (!loaded)
                            return [2 /*return*/, false];
                        return [2 /*return*/, safeBind(node, "fontFamily", tokenName, path)];
                }
            });
        });
    }
    function safeBindRadius(node, tokenName, path) {
        if (!tokenName)
            return;
        var variable = registry.get(tokenName);
        if (!variable) {
            warn("Missing variable for ".concat(path, ".radius: ").concat(tokenName));
            return;
        }
        var target = node;
        if (typeof target.setBoundVariable !== "function") {
            warn("Node ".concat(path, " does not support radius variable binding"));
            return;
        }
        try {
            target.setBoundVariable("cornerRadius", variable);
            return;
        }
        catch (_a) {
            // Some Figma runtimes only support per-corner radius bindings.
        }
        var failures = [];
        var successCount = 0;
        for (var _i = 0, INDIVIDUAL_RADIUS_BINDING_FIELDS_1 = INDIVIDUAL_RADIUS_BINDING_FIELDS; _i < INDIVIDUAL_RADIUS_BINDING_FIELDS_1.length; _i++) {
            var field = INDIVIDUAL_RADIUS_BINDING_FIELDS_1[_i];
            try {
                target.setBoundVariable(field, variable);
                successCount += 1;
            }
            catch (error) {
                failures.push("".concat(field, ": ").concat(formatError(error)));
            }
        }
        if (successCount === 0) {
            warn("Could not bind ".concat(path, ".radius to ").concat(tokenName, ": ").concat(failures.join("; ")));
        }
        else if (failures.length > 0) {
            warn("Partially bound ".concat(path, ".radius to ").concat(tokenName, "; unsupported fields: ").concat(failures.join("; ")));
        }
    }
    function safeResize(node, width, height, path) {
        if (typeof node.resize !== "function")
            return;
        try {
            node.resize(Math.max(1, safeNumber(width, 1)), Math.max(1, safeNumber(height, 1)));
        }
        catch (error) {
            warn("Could not resize ".concat(path, ": ").concat(formatError(error)));
        }
    }
    function safeResizeWithoutConstraints(node, width, height, path) {
        var _a;
        var layoutNode = node;
        var resize = (_a = layoutNode.resizeWithoutConstraints) !== null && _a !== void 0 ? _a : layoutNode.resize;
        if (typeof resize !== "function")
            return;
        try {
            resize.call(layoutNode, Math.max(1, safeNumber(width, 1)), Math.max(1, safeNumber(height, 1)));
        }
        catch (error) {
            warn("Could not resize ".concat(path, ": ").concat(formatError(error)));
        }
    }
    function applyTextAutoResize(node, mode, path) {
        if (!mode)
            return;
        try {
            node.textAutoResize = mode;
        }
        catch (error) {
            warn("Could not set text auto-resize for ".concat(path, ": ").concat(formatError(error)));
        }
    }
    function applyTextTruncation(node, styles, path) {
        if (styles.textTruncation !== "ENDING")
            return;
        try {
            node.textTruncation = "ENDING";
            if (typeof styles.maxLines === "number" && styles.maxLines >= 1) {
                node.maxLines = Math.round(styles.maxLines);
            }
        }
        catch (error) {
            warn("Could not set text truncation for ".concat(path, ": ").concat(formatError(error)));
        }
    }
    function loadTextFont(styles, path) {
        return __awaiter(this, void 0, void 0, function () {
            var family, styleCandidates, _i, styleCandidates_1, style, candidate, _a, fallback, error_2;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        family = getFontFamily(styles.fontFamily);
                        styleCandidates = getFontStyleCandidates((_b = styles.fontWeight) !== null && _b !== void 0 ? _b : 400);
                        _i = 0, styleCandidates_1 = styleCandidates;
                        _c.label = 1;
                    case 1:
                        if (!(_i < styleCandidates_1.length)) return [3 /*break*/, 6];
                        style = styleCandidates_1[_i];
                        candidate = { family: family, style: style };
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, figma.loadFontAsync(candidate)];
                    case 3:
                        _c.sent();
                        return [2 /*return*/, candidate];
                    case 4:
                        _a = _c.sent();
                        return [3 /*break*/, 5];
                    case 5:
                        _i++;
                        return [3 /*break*/, 1];
                    case 6:
                        fallback = { family: "Inter", style: "Regular" };
                        _c.label = 7;
                    case 7:
                        _c.trys.push([7, 9, , 10]);
                        return [4 /*yield*/, figma.loadFontAsync(fallback)];
                    case 8:
                        _c.sent();
                        warn("Loaded fallback font for ".concat(path, "; ").concat(family, " (").concat(styleCandidates.join(", "), ") was unavailable."));
                        return [2 /*return*/, fallback];
                    case 9:
                        error_2 = _c.sent();
                        warn("Could not load fallback font for ".concat(path, ": ").concat(formatError(error_2)));
                        throw error_2;
                    case 10: return [2 /*return*/];
                }
            });
        });
    }
    function resolveTokenValue(tokenName, visited) {
        var _a;
        if (visited === void 0) { visited = new Set(); }
        if (!tokenName)
            return undefined;
        if (visited.has(tokenName))
            return undefined;
        visited.add(tokenName);
        var token = tokenByCssName.get(tokenName);
        if (!token)
            return undefined;
        if (token.alias)
            return resolveTokenValue(token.alias, visited);
        return (_a = token.value) !== null && _a !== void 0 ? _a : token.rawValue;
    }
    function getFontFamilyFromToken(tokenName) {
        var value = resolveTokenValue(tokenName);
        return typeof value === "string" ? getFontFamily(value) : undefined;
    }
    function loadBoundFontFamily(tokenName, fontWeight, path) {
        return __awaiter(this, void 0, void 0, function () {
            var family, styleCandidates, _i, styleCandidates_2, style, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        family = getFontFamilyFromToken(tokenName);
                        if (!family) {
                            warn("Could not resolve font family token for ".concat(path, ".fontFamily: ").concat(tokenName));
                            return [2 /*return*/, false];
                        }
                        styleCandidates = getFontStyleCandidates(fontWeight);
                        _i = 0, styleCandidates_2 = styleCandidates;
                        _b.label = 1;
                    case 1:
                        if (!(_i < styleCandidates_2.length)) return [3 /*break*/, 6];
                        style = styleCandidates_2[_i];
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, figma.loadFontAsync({ family: family, style: style })];
                    case 3:
                        _b.sent();
                        return [2 /*return*/, true];
                    case 4:
                        _a = _b.sent();
                        return [3 /*break*/, 5];
                    case 5:
                        _i++;
                        return [3 /*break*/, 1];
                    case 6:
                        warn("Skipped fontFamily binding for ".concat(path, "; ").concat(family, " (").concat(styleCandidates.join(", "), ") could not be loaded."));
                        return [2 /*return*/, false];
                }
            });
        });
    }
    return {
        canCreateComponentDefinition: canCreateComponentDefinition,
        createComponentSetFromVariants: createComponentSetFromVariants,
        createNode: createNode,
        ensureComponentDefinition: ensureComponentDefinition,
        getComponentDefinitionParentPage: getComponentDefinitionParentPage,
        organizeComponentDependencySections: organizeComponentDependencySections,
        preparePageComponentDefinitions: preparePageComponentDefinitions,
        stats: stats,
        upsertVariables: upsertVariables,
    };
}
function getCollection(layer, collectionNames) {
    return __awaiter(this, void 0, void 0, function () {
        var collectionName, collections, existing, created;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    collectionName = collectionNames[layer];
                    return [4 /*yield*/, figma.variables.getLocalVariableCollectionsAsync()];
                case 1:
                    collections = _a.sent();
                    existing = collections.find(function (collection) { return collection.name === collectionName; });
                    if (existing)
                        return [2 /*return*/, existing];
                    created = figma.variables.createVariableCollection(collectionName);
                    if (created.modes[0] && created.modes[0].name !== "Default") {
                        created.renameMode(created.modes[0].modeId, "Default");
                    }
                    return [2 /*return*/, created];
            }
        });
    });
}
function findExistingVariable(collection, spec, pluginDataKey) {
    return __awaiter(this, void 0, void 0, function () {
        var variables, collectionVariables, byPluginData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, figma.variables.getLocalVariablesAsync()];
                case 1:
                    variables = _a.sent();
                    collectionVariables = variables.filter(function (variable) { return variable.variableCollectionId === collection.id; });
                    byPluginData = collectionVariables.find(function (variable) {
                        return getVariablePluginData(variable, pluginDataKey) === spec.cssName ||
                            getVariablePluginData(variable, LEGACY_CM_TOKEN_PLUGIN_DATA_KEY) === spec.cssName;
                    });
                    if (byPluginData)
                        return [2 /*return*/, byPluginData];
                    return [2 /*return*/, collectionVariables.find(function (variable) { return variable.name === spec.figmaName; })];
            }
        });
    });
}
function findVariableByCssToken(cssName, pluginDataKey) {
    return __awaiter(this, void 0, void 0, function () {
        var variables, byPluginData, figmaName;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, figma.variables.getLocalVariablesAsync()];
                case 1:
                    variables = _a.sent();
                    byPluginData = variables.find(function (variable) {
                        return getVariablePluginData(variable, pluginDataKey) === cssName ||
                            getVariablePluginData(variable, LEGACY_CM_TOKEN_PLUGIN_DATA_KEY) === cssName;
                    });
                    if (byPluginData)
                        return [2 /*return*/, byPluginData];
                    figmaName = cssTokenToFigmaVariableName(cssName);
                    return [2 /*return*/, variables.find(function (variable) { return variable.name === figmaName; })];
            }
        });
    });
}
function getVariablePluginData(variable, key) {
    var _a, _b, _c;
    try {
        return (_c = (_b = (_a = variable).getPluginData) === null || _b === void 0 ? void 0 : _b.call(_a, key)) !== null && _c !== void 0 ? _c : "";
    }
    catch (_d) {
        return "";
    }
}
function setVariablePluginData(variable, key, value) {
    var _a, _b;
    (_b = (_a = variable).setPluginData) === null || _b === void 0 ? void 0 : _b.call(_a, key, value);
}
function getNodePluginData(node, key) {
    var _a, _b, _c;
    try {
        return (_c = (_b = (_a = node).getPluginData) === null || _b === void 0 ? void 0 : _b.call(_a, key)) !== null && _c !== void 0 ? _c : "";
    }
    catch (_d) {
        return "";
    }
}
function setNodePluginData(node, key, value) {
    var _a, _b;
    try {
        (_b = (_a = node).setPluginData) === null || _b === void 0 ? void 0 : _b.call(_a, key, value);
    }
    catch (_c) {
        // Component metadata is best-effort and only used for future reuse.
    }
}
function getComponentSpecHash(spec) {
    var normalized = __assign(__assign({}, spec), { styles: __assign(__assign({}, spec.styles), { x: 0, y: 0 }) });
    var json = JSON.stringify(normalized);
    var hash = 5381;
    for (var index = 0; index < json.length; index += 1) {
        hash = ((hash << 5) + hash + json.charCodeAt(index)) | 0;
    }
    return String(hash >>> 0);
}
function getComponentDisplayName(component) {
    var variantDisplayName = getVariantPropertyDisplayName(component);
    if (variantDisplayName)
        return "".concat(component.name, ", ").concat(variantDisplayName);
    return component.name;
}
function getVariantPropertyDisplayName(component) {
    var variantProperties = component.variantProperties && Object.keys(component.variantProperties).length > 0
        ? component.variantProperties
        : component.variant
            ? { Variant: component.variant }
            : undefined;
    if (!variantProperties)
        return "";
    return Object.entries(variantProperties)
        .map(function (_a) {
        var name = _a[0], value = _a[1];
        return "".concat(name, "=").concat(value);
    })
        .join(", ");
}
function cssTokenToFigmaVariableName(cssName) {
    return cssName.replace(/^--/, "").replace(/-/g, "/");
}
function normalizeVariableValue(spec) {
    var _a;
    var value = (_a = spec.value) !== null && _a !== void 0 ? _a : parseRawTokenValue(spec.rawValue, spec.type);
    if (spec.type === "COLOR") {
        return cloneColor(value);
    }
    if (spec.type === "FLOAT") {
        return safeNumber(value, 0);
    }
    if (spec.type === "BOOLEAN") {
        return Boolean(value);
    }
    return String(value !== null && value !== void 0 ? value : "");
}
function parseRawTokenValue(rawValue, type) {
    var raw = String(rawValue !== null && rawValue !== void 0 ? rawValue : "").trim();
    if (type === "COLOR")
        return colorFromCss(raw);
    if (type === "FLOAT") {
        var number = raw.match(/^-?\d+(?:\.\d+)?/);
        return number ? Number(number[0]) : 0;
    }
    if (type === "BOOLEAN")
        return raw === "true";
    return raw.replace(/^["']|["']$/g, "");
}
function cloneColor(value) {
    var color = isColor(value) ? value : colorFromCss(String(value !== null && value !== void 0 ? value : ""));
    return {
        a: clamp(safeNumber(color.a, 1), 0, 1),
        b: clamp(safeNumber(color.b, 0), 0, 1),
        g: clamp(safeNumber(color.g, 0), 0, 1),
        r: clamp(safeNumber(color.r, 0), 0, 1),
    };
}
function colorFromCss(cssValue) {
    if (!cssValue)
        return { a: 1, b: 0, g: 0, r: 0 };
    var value = cssValue.trim();
    var hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
        var expanded = hex[1].length === 3
            ? hex[1]
                .split("")
                .map(function (part) { return "".concat(part).concat(part); })
                .join("")
            : hex[1];
        var intValue = Number.parseInt(expanded, 16);
        return {
            a: 1,
            b: (intValue & 255) / 255,
            g: ((intValue >> 8) & 255) / 255,
            r: ((intValue >> 16) & 255) / 255,
        };
    }
    var rgb = value.match(/rgba?\(([^)]+)\)/i);
    if (rgb) {
        var parts = rgb[1].split(",").map(function (part) { return Number(part.trim()); });
        return {
            a: clamp(safeNumber(parts[3], 1), 0, 1),
            b: clamp(safeNumber(parts[2], 0) / 255, 0, 1),
            g: clamp(safeNumber(parts[1], 0) / 255, 0, 1),
            r: clamp(safeNumber(parts[0], 0) / 255, 0, 1),
        };
    }
    return { a: 1, b: 0, g: 0, r: 0 };
}
function parsePayload(json) {
    var parsed;
    try {
        parsed = JSON.parse(json);
    }
    catch (error) {
        throw new Error("Invalid JSON. Use Storybook's Copy JSON output. ".concat(formatError(error)));
    }
    if (!isRecord(parsed)) {
        throw new Error("Invalid payload: expected a JSON object.");
    }
    if (typeof parsed.version !== "number" ||
        !SUPPORTED_PAYLOAD_VERSIONS.includes(parsed.version)) {
        throw new Error("Unsupported payload version ".concat(String(parsed.version), ". Expected version 1 or 2."));
    }
    if (!Array.isArray(parsed.tokens)) {
        throw new Error("Invalid payload: tokens must be an array.");
    }
    if (!isRecord(parsed.root)) {
        throw new Error("Invalid payload: root node tree is missing.");
    }
    if (typeof parsed.componentTitle !== "string") {
        throw new Error("Invalid payload: componentTitle must be a string.");
    }
    if (typeof parsed.storyId !== "string" || typeof parsed.storyName !== "string") {
        throw new Error("Invalid payload: story metadata is missing.");
    }
    if (parsed.artifactKind !== undefined &&
        parsed.artifactKind !== "component" &&
        parsed.artifactKind !== "page") {
        throw new Error("Invalid payload: artifactKind must be component or page.");
    }
    if (parsed.storyTitle !== undefined && typeof parsed.storyTitle !== "string") {
        throw new Error("Invalid payload: storyTitle must be a string.");
    }
    if (parsed.component !== undefined) {
        validateComponentReference(parsed.component, "component");
    }
    for (var _i = 0, _a = parsed.tokens; _i < _a.length; _i++) {
        var token = _a[_i];
        validateToken(token);
    }
    validateNode(parsed.root, "root");
    return parsed;
}
function validateToken(token) {
    if (!isRecord(token))
        throw new Error("Invalid token: expected object.");
    if (token.collection !== "ref" &&
        token.collection !== "sys" &&
        token.collection !== "comp") {
        throw new Error("Invalid token collection for ".concat(String(token.cssName), "."));
    }
    if (!isCssCustomPropertyName(token.cssName)) {
        throw new Error("Invalid token: cssName must be a CSS custom property name.");
    }
    if (typeof token.figmaName !== "string" || token.figmaName.length === 0) {
        throw new Error("Invalid token ".concat(token.cssName, ": figmaName is missing."));
    }
    if (token.type !== "BOOLEAN" &&
        token.type !== "COLOR" &&
        token.type !== "FLOAT" &&
        token.type !== "STRING") {
        throw new Error("Invalid token ".concat(token.cssName, ": unsupported type."));
    }
    if ("alias" in token && typeof token.alias !== "string") {
        throw new Error("Invalid token ".concat(token.cssName, ": alias must be a string."));
    }
}
function isCssCustomPropertyName(value) {
    return typeof value === "string" && /^--[A-Za-z0-9_-]+$/.test(value);
}
function validateNode(node, path) {
    if (!isRecord(node))
        throw new Error("Invalid node ".concat(path, ": expected object."));
    if (node.kind !== "frame" &&
        node.kind !== "image" &&
        node.kind !== "svg" &&
        node.kind !== "text") {
        throw new Error("Invalid node ".concat(path, ": unsupported kind."));
    }
    if (typeof node.name !== "string") {
        throw new Error("Invalid node ".concat(path, ": name must be a string."));
    }
    if (!isRecord(node.styles)) {
        throw new Error("Invalid node ".concat(path, ": styles are missing."));
    }
    if (typeof node.styles.width !== "number" ||
        typeof node.styles.height !== "number" ||
        typeof node.styles.x !== "number" ||
        typeof node.styles.y !== "number") {
        throw new Error("Invalid node ".concat(path, ": width, height, x, and y must be numbers."));
    }
    if (node.styles.textAutoResize !== undefined &&
        node.styles.textAutoResize !== "WIDTH_AND_HEIGHT") {
        throw new Error("Invalid node ".concat(path, ": unsupported textAutoResize value."));
    }
    if (node.styles.textTruncation !== undefined &&
        node.styles.textTruncation !== "ENDING") {
        throw new Error("Invalid node ".concat(path, ": unsupported textTruncation value."));
    }
    if (node.styles.maxLines !== undefined && typeof node.styles.maxLines !== "number") {
        throw new Error("Invalid node ".concat(path, ": maxLines must be a number."));
    }
    if (node.styles.textAlign !== undefined && typeof node.styles.textAlign !== "string") {
        throw new Error("Invalid node ".concat(path, ": textAlign must be a string."));
    }
    if (node.styles.layoutAlign !== undefined &&
        node.styles.layoutAlign !== "STRETCH") {
        throw new Error("Invalid node ".concat(path, ": unsupported layoutAlign value."));
    }
    if (node.styles.layoutGrow !== undefined &&
        node.styles.layoutGrow !== 1) {
        throw new Error("Invalid node ".concat(path, ": unsupported layoutGrow value."));
    }
    if (node.styles.layoutSizingHorizontal !== undefined &&
        node.styles.layoutSizingHorizontal !== "HUG") {
        throw new Error("Invalid node ".concat(path, ": unsupported layoutSizingHorizontal value."));
    }
    if (node.styles.layoutSizingVertical !== undefined &&
        node.styles.layoutSizingVertical !== "HUG") {
        throw new Error("Invalid node ".concat(path, ": unsupported layoutSizingVertical value."));
    }
    if (node.styles.textAlignVertical !== undefined &&
        node.styles.textAlignVertical !== "CENTER") {
        throw new Error("Invalid node ".concat(path, ": unsupported textAlignVertical value."));
    }
    if (node.styles.backgroundLinearGradient !== undefined) {
        validateLinearGradient(node.styles.backgroundLinearGradient, "".concat(path, ".backgroundLinearGradient"));
    }
    if (node.styles.borderSides !== undefined) {
        validateBorderSides(node.styles.borderSides, "".concat(path, ".borderSides"));
    }
    if (node.styles.outOfFlow !== undefined && typeof node.styles.outOfFlow !== "boolean") {
        throw new Error("Invalid node ".concat(path, ": outOfFlow must be a boolean."));
    }
    if (node.styles.constraints !== undefined) {
        validateConstraints(node.styles.constraints, "".concat(path, ".constraints"));
    }
    if (node.component !== undefined) {
        validateComponentReference(node.component, "".concat(path, ".component"));
    }
    if (node.children !== undefined) {
        if (!Array.isArray(node.children)) {
            throw new Error("Invalid node ".concat(path, ": children must be an array."));
        }
        node.children.forEach(function (child, index) { return validateNode(child, "".concat(path, "/").concat(index)); });
    }
}
var CONSTRAINT_VALUES = ["CENTER", "MAX", "MIN", "SCALE", "STRETCH"];
function validateConstraints(constraints, path) {
    if (!isRecord(constraints)) {
        throw new Error("Invalid node ".concat(path, ": expected object."));
    }
    if (!CONSTRAINT_VALUES.includes(String(constraints.horizontal)) ||
        !CONSTRAINT_VALUES.includes(String(constraints.vertical))) {
        throw new Error("Invalid node ".concat(path, ": unsupported constraint value."));
    }
}
function validateBorderSides(borderSides, path) {
    if (!isRecord(borderSides)) {
        throw new Error("Invalid node ".concat(path, ": expected object."));
    }
    for (var _i = 0, _a = ["top", "right", "bottom", "left"]; _i < _a.length; _i++) {
        var side = _a[_i];
        var value = borderSides[side];
        if (value === undefined)
            continue;
        if (!isRecord(value) || typeof value.width !== "number") {
            throw new Error("Invalid node ".concat(path, ".").concat(side, ": width must be a number."));
        }
        if (value.color !== undefined && typeof value.color !== "string") {
            throw new Error("Invalid node ".concat(path, ".").concat(side, ": color must be a string."));
        }
    }
}
function validateLinearGradient(gradient, path) {
    if (!isRecord(gradient)) {
        throw new Error("Invalid node ".concat(path, ": expected object."));
    }
    if (typeof gradient.angle !== "number") {
        throw new Error("Invalid node ".concat(path, ": angle must be a number."));
    }
    if (!Array.isArray(gradient.stops) || gradient.stops.length < 2) {
        throw new Error("Invalid node ".concat(path, ": stops must contain at least two colors."));
    }
    gradient.stops.forEach(function (stop, index) {
        if (!isRecord(stop)) {
            throw new Error("Invalid node ".concat(path, ".stops.").concat(index, ": expected object."));
        }
        if (typeof stop.color !== "string") {
            throw new Error("Invalid node ".concat(path, ".stops.").concat(index, ": color must be a string."));
        }
        if (typeof stop.position !== "number") {
            throw new Error("Invalid node ".concat(path, ".stops.").concat(index, ": position must be a number."));
        }
        if (stop.token !== undefined && typeof stop.token !== "string") {
            throw new Error("Invalid node ".concat(path, ".stops.").concat(index, ": token must be a string."));
        }
    });
}
function validateComponentReference(component, path) {
    if (!isRecord(component)) {
        throw new Error("Invalid ".concat(path, ": expected object."));
    }
    if (typeof component.key !== "string" ||
        typeof component.name !== "string" ||
        typeof component.sourceName !== "string") {
        throw new Error("Invalid ".concat(path, ": key, name, and sourceName are required."));
    }
    if (component.variant !== undefined && typeof component.variant !== "string") {
        throw new Error("Invalid ".concat(path, ": variant must be a string."));
    }
}
function getInferredChildTextAlignHorizontal(parent) {
    if (parent.layoutMode === "HORIZONTAL") {
        if (parent.primaryAxisAlignItems === "CENTER")
            return "CENTER";
        if (parent.primaryAxisAlignItems === "MAX")
            return "RIGHT";
    }
    if (parent.layoutMode === "VERTICAL") {
        if (parent.counterAxisAlignItems === "CENTER")
            return "CENTER";
        if (parent.counterAxisAlignItems === "MAX")
            return "RIGHT";
    }
    return undefined;
}
function mapTextAlignHorizontal(value) {
    var normalized = String(value !== null && value !== void 0 ? value : "").trim().toLowerCase();
    if (!normalized)
        return undefined;
    if (normalized === "center" || normalized === "-webkit-center")
        return "CENTER";
    if (normalized === "right" || normalized === "end")
        return "RIGHT";
    if (normalized === "justify")
        return "JUSTIFIED";
    if (normalized === "left" || normalized === "start")
        return "LEFT";
    return undefined;
}
function mapAxisAlignment(value) {
    if (value === "center")
        return "CENTER";
    if (value === "flex-end" || value === "end")
        return "MAX";
    if (value === "space-between")
        return "SPACE_BETWEEN";
    return "MIN";
}
function mapCounterAlignment(value) {
    if (value === "center")
        return "CENTER";
    if (value === "flex-end" || value === "end")
        return "MAX";
    return "MIN";
}
function getFontStyleCandidates(weight) {
    if (weight >= 700)
        return ["Bold", "Semibold", "Semi Bold", "SemiBold", "Medium", "Regular"];
    if (weight >= 600)
        return ["Semi Bold", "Semibold", "SemiBold", "Medium", "Regular"];
    if (weight >= 500)
        return ["Medium", "Regular"];
    return ["Regular"];
}
function getFontFamily(fontFamily) {
    var _a;
    var first = (_a = String(fontFamily || "Inter").split(",")[0]) === null || _a === void 0 ? void 0 : _a.trim();
    return first ? first.replace(/^["']|["']$/g, "") : "Inter";
}
function safeNumber(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function isColor(value) {
    return (isRecord(value) &&
        typeof value.r === "number" &&
        typeof value.g === "number" &&
        typeof value.b === "number");
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function formatError(error) {
    return error instanceof Error ? error.message : String(error);
}

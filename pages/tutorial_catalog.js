import { allCommands } from "../background_scripts/all_commands.js";
import { KeyMappingsParser } from "../background_scripts/commands.js";

const groupTitles = {
  navigation: "Navigating the page",
  vomnibar: "Using the Vomnibar",
  find: "Using find",
  history: "Navigating history",
  tabs: "Manipulating tabs",
  misc: "Miscellaneous",
};

const simulatedCommands = new Set([
  "reload",
  "copyCurrentUrl",
  "openCopiedUrlInCurrentTab",
  "openCopiedUrlInNewTab",
  "goUp",
  "goToRoot",
  "LinkHints.activateMode",
  "LinkHints.activateModeToOpenInNewTab",
  "LinkHints.activateModeToOpenInNewForegroundTab",
  "LinkHints.activateModeWithQueue",
  "LinkHints.activateModeToDownloadLink",
  "LinkHints.activateModeToOpenIncognito",
  "LinkHints.activateModeToCopyLinkUrl",
  "goPrevious",
  "goNext",
  "nextFrame",
  "mainFrame",
  "Vomnibar.activate",
  "Vomnibar.activateInNewTab",
  "Vomnibar.activateBookmarks",
  "Vomnibar.activateBookmarksInNewTab",
  "Vomnibar.activateCommandSelection",
  "Vomnibar.activateTabSelection",
  "Vomnibar.activateEditUrl",
  "Vomnibar.activateEditUrlInNewTab",
  "goBack",
  "goForward",
  "createTab",
  "previousTab",
  "nextTab",
  "visitPreviousTab",
  "firstTab",
  "lastTab",
  "duplicateTab",
  "togglePinTab",
  "toggleMuteTab",
  "removeTab",
  "restoreTab",
  "moveTabToNewWindow",
  "closeTabsOnLeft",
  "closeTabsOnRight",
  "closeOtherTabs",
  "moveTabLeft",
  "moveTabRight",
  "setZoom",
  "zoomIn",
  "zoomOut",
  "zoomReset",
  "toggleViewSource",
  "showHelp",
]);

const effectByCommand = {
  scrollDown: "scroll-down",
  scrollUp: "scroll-up",
  scrollToTop: "scroll-top",
  scrollToBottom: "scroll-bottom",
  scrollPageDown: "scroll-down",
  scrollPageUp: "scroll-up",
  scrollFullPageDown: "scroll-down",
  scrollFullPageUp: "scroll-up",
  scrollLeft: "scroll-left",
  scrollRight: "scroll-right",
  scrollToLeft: "scroll-left-edge",
  scrollToRight: "scroll-right-edge",
  reload: "page-status",
  copyCurrentUrl: "clipboard",
  openCopiedUrlInCurrentTab: "clipboard",
  openCopiedUrlInNewTab: "clipboard",
  goUp: "url",
  goToRoot: "url",
  enterInsertMode: "insert-mode",
  enterVisualMode: "visual-mode",
  enterVisualLineMode: "visual-mode",
  passNextKey: "mode",
  focusInput: "focus-input",
  "LinkHints.activateMode": "link-hints",
  "LinkHints.activateModeToOpenInNewTab": "link-hints",
  "LinkHints.activateModeToOpenInNewForegroundTab": "link-hints",
  "LinkHints.activateModeWithQueue": "link-hints",
  "LinkHints.activateModeToDownloadLink": "link-hints",
  "LinkHints.activateModeToOpenIncognito": "link-hints",
  "LinkHints.activateModeToCopyLinkUrl": "link-hints",
  goPrevious: "prev-next",
  goNext: "prev-next",
  nextFrame: "frames",
  mainFrame: "frames",
  "Marks.activateCreateMode": "marks",
  "Marks.activateGotoMode": "marks",
  "Vomnibar.activate": "vomnibar",
  "Vomnibar.activateInNewTab": "vomnibar",
  "Vomnibar.activateBookmarks": "vomnibar",
  "Vomnibar.activateBookmarksInNewTab": "vomnibar",
  "Vomnibar.activateCommandSelection": "vomnibar",
  "Vomnibar.activateTabSelection": "vomnibar",
  "Vomnibar.activateEditUrl": "vomnibar",
  "Vomnibar.activateEditUrlInNewTab": "vomnibar",
  enterFindMode: "find",
  performFind: "find-next",
  performBackwardsFind: "find-prev",
  findSelected: "find-selected",
  findSelectedBackwards: "find-selected",
  goBack: "history",
  goForward: "history",
  createTab: "tabs",
  previousTab: "tabs",
  nextTab: "tabs",
  visitPreviousTab: "tabs",
  firstTab: "tabs",
  lastTab: "tabs",
  duplicateTab: "tabs",
  togglePinTab: "tabs",
  toggleMuteTab: "tabs",
  removeTab: "tabs",
  restoreTab: "tabs",
  moveTabToNewWindow: "tabs",
  closeTabsOnLeft: "tabs",
  closeTabsOnRight: "tabs",
  closeOtherTabs: "tabs",
  moveTabLeft: "tabs",
  moveTabRight: "tabs",
  setZoom: "zoom",
  zoomIn: "zoom",
  zoomOut: "zoom",
  zoomReset: "zoom",
  toggleViewSource: "page-status",
  showHelp: "help",
};

function getHintKey(settings) {
  const characters = settings?.filterLinkHints
    ? settings?.linkHintNumbers
    : settings?.linkHintCharacters;
  return characters?.[0]?.toLowerCase() || "s";
}

function getFollowUpSteps(commandName, settings) {
  const hintKey = getHintKey(settings);
  const byCommand = {
    enterInsertMode: [
      {
        type: "literal",
        label: "Esc",
        sequence: ["<escape>"],
        prompt: "Return to normal mode.",
        successText: "Normal mode restored.",
      },
    ],
    "LinkHints.activateMode": [
      {
        type: "literal",
        label: hintKey,
        sequence: [hintKey],
        prompt: "Choose the highlighted link hint.",
        successText: "The link hint was selected.",
      },
    ],
    "LinkHints.activateModeToOpenInNewTab": [
      {
        type: "literal",
        label: hintKey,
        sequence: [hintKey],
        prompt: "Choose the highlighted link hint.",
        successText: "A background tab was queued in the sandbox.",
      },
    ],
    "LinkHints.activateModeToOpenInNewForegroundTab": [
      {
        type: "literal",
        label: hintKey,
        sequence: [hintKey],
        prompt: "Choose the highlighted link hint.",
        successText: "A foreground tab was selected in the sandbox.",
      },
    ],
    "LinkHints.activateModeWithQueue": [
      {
        type: "literal",
        label: `${hintKey} ${hintKey}`,
        sequence: [hintKey, hintKey],
        prompt: "Queue the highlighted link twice.",
        successText: "The sandbox queued two links.",
      },
    ],
    "LinkHints.activateModeToCopyLinkUrl": [
      {
        type: "literal",
        label: hintKey,
        sequence: [hintKey],
        prompt: "Choose the highlighted link hint.",
        successText: "The sandbox copied the link URL.",
      },
    ],
    "Marks.activateCreateMode": [
      {
        type: "literal",
        label: "a",
        sequence: ["a"],
        prompt: "Store this position in mark a.",
        successText: "Mark a was saved in the sandbox.",
      },
    ],
    "Marks.activateGotoMode": [
      {
        type: "literal",
        label: "a",
        sequence: ["a"],
        prompt: "Jump to mark a.",
        successText: "The sandbox jumped to mark a.",
      },
    ],
    enterFindMode: [
      {
        type: "literal",
        label: "needle Enter",
        sequence: ["n", "e", "e", "d", "l", "e", "<enter>"],
        prompt: "Search for needle.",
        successText: "The match was selected.",
      },
    ],
    "Vomnibar.activate": [
      {
        type: "literal",
        label: "vimium Enter",
        sequence: ["v", "i", "m", "i", "u", "m", "<enter>"],
        prompt: "Run a simulated Vomnibar query.",
        successText: "The sandbox accepted the query.",
      },
    ],
    "Vomnibar.activateCommandSelection": [
      {
        type: "literal",
        label: "scrollDown Enter",
        sequence: [
          "s",
          "c",
          "r",
          "o",
          "l",
          "l",
          "D",
          "o",
          "w",
          "n",
          "<enter>",
        ],
        prompt: "Select a simulated command.",
        successText: "The command was selected in the sandbox.",
      },
    ],
  };
  return byCommand[commandName] || [];
}

function getLessonKind(command) {
  if (command.name.startsWith("Vomnibar.")) return "vomnibar";
  if (command.name.startsWith("LinkHints.")) return "link-hints";
  if (command.name.startsWith("Marks.")) return "marks";
  if (command.group == "tabs") return "tabs";
  return "keystroke";
}

function createLesson(command, settings) {
  const risk = simulatedCommands.has(command.name) ? "simulated" : "safe";
  return {
    id: `command:${command.name}`,
    command: command.name,
    title: command.desc,
    description: command.details || command.desc,
    group: command.group,
    advanced: Boolean(command.advanced),
    kind: getLessonKind(command),
    risk,
    effect: effectByCommand[command.name] || "page-status",
    sandboxSetup: risk == "simulated" ? "sandbox" : "page-local",
    successCriteria: `Complete the mapped key sequence for ${command.name}.`,
    followUpSteps: getFollowUpSteps(command.name, settings),
  };
}

function createTutorialLessons({ settings } = {}) {
  return allCommands.map((command) => createLesson(command, settings));
}

function getKeysForCommand(commandToOptionsToKeys, commandName) {
  const variations = commandToOptionsToKeys?.[commandName] || {};
  return Object.values(variations).flat(1).sort(compareKeys);
}

function getAcceptedSequencesForCommand(commandToOptionsToKeys, commandName) {
  return getKeysForCommand(commandToOptionsToKeys, commandName)
    .map((key) => KeyMappingsParser.parseKeySequence(key))
    .filter((sequence) => sequence.length > 0);
}

function getRequiredLessonIds(lessons, commandToOptionsToKeys) {
  return lessons
    .filter((lesson) => getKeysForCommand(commandToOptionsToKeys, lesson.command).length > 0)
    .map((lesson) => lesson.id);
}

function compareKeys(a, b) {
  a = a.replace("<", "~");
  b = b.replace("<", "~");
  if (a < b) return -1;
  if (b < a) return 1;
  return 0;
}

export {
  createTutorialLessons,
  getAcceptedSequencesForCommand,
  getKeysForCommand,
  getRequiredLessonIds,
  groupTitles,
  simulatedCommands,
};

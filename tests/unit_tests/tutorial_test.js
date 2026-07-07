import * as testHelper from "./test_helper.js";
import "../../lib/settings.js";
import "../../lib/keyboard_utils.js";
import { allCommands } from "../../background_scripts/all_commands.js";
import {
  createTutorialLessons,
  getAcceptedSequencesForCommand,
  getKeysForCommand,
  getRequiredLessonIds,
  simulatedCommands,
} from "../../pages/tutorial_catalog.js";
import { TutorialKeyTracker } from "../../pages/tutorial_key_tracker.js";
import {
  createDefaultTutorialProgress,
  loadTutorialProgress,
  normalizeTutorialProgress,
  recordLessonAttempt,
  resetTutorialProgress,
  saveTutorialProgress,
  tutorialProgressKey,
} from "../../pages/tutorial_progress.js";
import { initTutorialPage } from "../../pages/tutorial.js";

context("tutorial catalog", () => {
  should("include one lesson per Vimium command", () => {
    const lessons = createTutorialLessons({ settings: Settings.defaultOptions });
    const commandNames = allCommands.map((command) => command.name).sort();
    const lessonCommandNames = lessons.map((lesson) => lesson.command).sort();
    assert.equal(commandNames, lessonCommandNames);
  });

  should("mark risky commands as simulated", () => {
    const lesson = createTutorialLessons({ settings: Settings.defaultOptions })
      .find((lesson) => lesson.command === "removeTab");
    assert.isTrue(simulatedCommands.has("removeTab"));
    assert.equal("simulated", lesson.risk);
  });

  should("resolve all mapped key variants for a command", () => {
    const commandToOptionsToKeys = {
      reload: {
        "": ["r"],
        hard: ["R"],
      },
    };
    assert.equal(["R", "r"], getKeysForCommand(commandToOptionsToKeys, "reload"));
  });

  should("parse accepted key sequences", () => {
    const commandToOptionsToKeys = {
      scrollToTop: {
        "": ["gg"],
      },
      moveTabLeft: {
        "": ["<<"],
      },
      "LinkHints.activateModeWithQueue": {
        "": ["<a-f>"],
      },
    };
    assert.equal(
      [["g", "g"]],
      getAcceptedSequencesForCommand(commandToOptionsToKeys, "scrollToTop"),
    );
    assert.equal(
      [["<", "<"]],
      getAcceptedSequencesForCommand(commandToOptionsToKeys, "moveTabLeft"),
    );
    assert.equal(
      [["<a-f>"]],
      getAcceptedSequencesForCommand(commandToOptionsToKeys, "LinkHints.activateModeWithQueue"),
    );
  });

  should("only require mapped lessons for progress totals", () => {
    const lessons = createTutorialLessons({ settings: Settings.defaultOptions });
    const required = getRequiredLessonIds(lessons, {
      scrollDown: {
        "": ["j"],
      },
    });
    assert.equal(["command:scrollDown"], required);
  });
});

context("TutorialKeyTracker", () => {
  should("accept multi-key sequences", () => {
    const successes = [];
    const tracker = new TutorialKeyTracker({
      acceptedSequences: [["g", "g"]],
      onSuccess: (result) => successes.push(result),
    });

    assert.equal("partial", tracker.handleKeyString("g").status);
    assert.equal("success", tracker.handleKeyString("g").status);
    assert.equal([["g", "g"]], successes.map((result) => result.sequence));
  });

  should("accept count prefixes", () => {
    const tracker = new TutorialKeyTracker({ acceptedSequences: [["j"]] });
    assert.equal({ status: "count", count: 5, typedSequence: [] }, tracker.handleKeyString("5"));
    const result = tracker.handleKeyString("j");
    assert.equal("success", result.status);
    assert.equal(5, result.count);
  });

  should("accept digit sequences when count prefixes are disabled", () => {
    const tracker = new TutorialKeyTracker({
      acceptedSequences: [["1"]],
      allowCountPrefix: false,
    });
    assert.equal("success", tracker.handleKeyString("1").status);
  });

  should("accept escape when it is an expected sequence", () => {
    const tracker = new TutorialKeyTracker({
      acceptedSequences: [["<escape>"]],
      allowCountPrefix: false,
    });
    assert.equal("success", tracker.handleKeyString("<escape>").status);
  });

  should("reset after a wrong key", () => {
    const tracker = new TutorialKeyTracker({ acceptedSequences: [["g", "g"]] });
    assert.equal("partial", tracker.handleKeyString("g").status);
    assert.equal("wrong", tracker.handleKeyString("x").status);
    assert.equal("partial", tracker.handleKeyString("g").status);
  });

  should("use injected key normalization for mapped keys", () => {
    let prevented = false;
    let stopped = false;
    const tracker = new TutorialKeyTracker({
      acceptedSequences: [["a"]],
      getKeyString: (event) => event.mappedKey,
    });
    const result = tracker.handleKeydown({
      mappedKey: "a",
      preventDefault: () => prevented = true,
      stopPropagation: () => stopped = true,
    });
    assert.equal("success", result.status);
    assert.isTrue(prevented);
    assert.isTrue(stopped);
  });
});

context("tutorial progress", () => {
  setup(() => {
    chrome.storage.local.clear();
  });

  teardown(() => {
    chrome.storage.local.clear();
  });

  should("reset unknown progress versions", () => {
    const progress = normalizeTutorialProgress({ version: 999 }, ["lesson"]);
    assert.equal(createDefaultTutorialProgress(), progress);
  });

  should("record attempts and completions", () => {
    let progress = createDefaultTutorialProgress();
    progress = recordLessonAttempt(progress, "lesson", { success: false });
    assert.equal(1, progress.statsByLesson.lesson.attempts);
    assert.equal(0, progress.statsByLesson.lesson.streak);

    progress = recordLessonAttempt(progress, "lesson", {
      success: true,
      elapsedMs: 50,
      now: "2026-07-07T00:00:00.000Z",
    });
    assert.equal(["lesson"], progress.completedLessonIds);
    assert.equal(2, progress.statsByLesson.lesson.attempts);
    assert.equal(1, progress.statsByLesson.lesson.successes);
    assert.equal(50, progress.statsByLesson.lesson.bestMs);
  });

  should("save, load, and reset local progress", async () => {
    const progress = recordLessonAttempt(createDefaultTutorialProgress(), "lesson", {
      success: true,
    });
    await saveTutorialProgress(progress);
    assert.equal(
      ["lesson"],
      (await loadTutorialProgress(["lesson"])).completedLessonIds,
    );

    await resetTutorialProgress();
    const stored = (await chrome.storage.local.get(tutorialProgressKey))[tutorialProgressKey];
    assert.equal([], stored.completedLessonIds);
  });
});

context("tutorial page", () => {
  setup(async () => {
    await testHelper.jsdomStub("pages/tutorial.html");
    await Settings.clear();
    await Settings.onLoaded();
  });

  teardown(async () => {
    await Settings.clear();
    await chrome.storage.local.clear();
  });

  should("render the first mapped lesson", async () => {
    await initTutorialPage({
      skipCommandsInit: true,
      settings: Settings.getSettings(),
      commandToOptionsToKeys: {
        scrollDown: {
          "": ["j"],
        },
      },
      progress: createDefaultTutorialProgress(),
      saveProgress: async () => {},
    });

    assert.equal("Scroll down", document.querySelector("#tutorial-title").textContent);
    assert.equal("scrollDown", document.querySelector("#tutorial-command-name").textContent);
    assert.equal("j", document.querySelector(".key").textContent);
  });

  should("complete a lesson from a keydown", async () => {
    const app = await initTutorialPage({
      skipCommandsInit: true,
      settings: Settings.getSettings(),
      commandToOptionsToKeys: {
        scrollDown: {
          "": ["j"],
        },
      },
      progress: createDefaultTutorialProgress(),
      saveProgress: async () => {},
    });

    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "j" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(["command:scrollDown"], app.progress.completedLessonIds);
    assert.equal("Lesson complete.", document.querySelector("#tutorial-feedback").textContent);
  });

  should("move the practice viewport when a scroll command succeeds", async () => {
    const app = await initTutorialPage({
      skipCommandsInit: true,
      settings: Settings.getSettings(),
      commandToOptionsToKeys: {
        scrollDown: {
          "": ["j"],
        },
      },
      progress: createDefaultTutorialProgress(),
      saveProgress: async () => {},
    });

    const token = document.querySelector(".tutorial-motion-token");
    assert.isTrue(token.style.transform.includes("68px"));
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "j" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(3, app.stageState.row);
    assert.isTrue(token.style.transform.includes("102px"));
    assert.equal("51%", document.querySelector(".tutorial-scroll-meter span").style.width);
  });

  should("advance to the next lesson by selecting Next with link hints", async () => {
    const app = await initTutorialPage({
      skipCommandsInit: true,
      settings: Settings.getSettings(),
      commandToOptionsToKeys: {
        scrollDown: {
          "": ["j"],
        },
        scrollUp: {
          "": ["k"],
        },
        "LinkHints.activateMode": {
          "": ["f"],
        },
      },
      progress: createDefaultTutorialProgress(),
      saveProgress: async () => {},
    });

    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "j" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal("scrollDown", app.currentLesson.command);
    assert.equal(0, app.advanceState.stepIndex);
    const teachingText = document.querySelector("#tutorial-step").textContent;
    assert.isTrue(teachingText.includes("Vimium selects clickable things with link hints"));
    assert.isTrue(teachingText.includes("first press f"));
    assert.isTrue(teachingText.includes("the label will be s"));

    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "f" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(1, app.advanceState.stepIndex);
    assert.equal("s", document.querySelector(".tutorial-control-hint").textContent);

    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "s" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal("scrollUp", app.currentLesson.command);
    assert.equal(null, app.advanceState);
    assert.equal(["command:scrollDown"], app.progress.completedLessonIds);
  });

  should("complete a lesson with a literal escape follow-up step", async () => {
    const app = await initTutorialPage({
      skipCommandsInit: true,
      settings: Settings.getSettings(),
      commandToOptionsToKeys: {
        enterInsertMode: {
          "": ["i"],
        },
      },
      progress: createDefaultTutorialProgress(),
      saveProgress: async () => {},
    });

    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "i" }));
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(["command:enterInsertMode"], app.progress.completedLessonIds);
  });
});

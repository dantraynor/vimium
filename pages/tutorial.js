import "../lib/utils.js";
import "../lib/settings.js";
import "../lib/keyboard_utils.js";
import { Commands } from "../background_scripts/commands.js";
import {
  createTutorialLessons,
  getAcceptedSequencesForCommand,
  getKeysForCommand,
  getRequiredLessonIds,
  groupTitles,
} from "./tutorial_catalog.js";
import { TutorialKeyTracker } from "./tutorial_key_tracker.js";
import {
  loadTutorialProgress,
  recordLessonAttempt,
  resetTutorialProgress,
  saveTutorialProgress,
  setCurrentLesson,
} from "./tutorial_progress.js";

class TutorialApp {
  constructor({
    root,
    lessons,
    commandToOptionsToKeys,
    progress,
    saveProgress = saveTutorialProgress,
  }) {
    this.root = root;
    this.lessons = lessons;
    this.commandToOptionsToKeys = commandToOptionsToKeys || {};
    this.requiredLessonIds = getRequiredLessonIds(this.lessons, this.commandToOptionsToKeys);
    this.progress = progress;
    this.saveProgress = saveProgress;
    this.currentLessonId = this.progress.currentLessonId || this.requiredLessonIds[0] ||
      this.lessons[0]?.id;
    this.advanceState = null;
    this.stageState = {};
    this.currentStepIndex = 0;
    this.lessonStartedAt = Date.now();

    this.tracker = new TutorialKeyTracker({
      onSuccess: (result) => this.onStepSuccess(result),
      onWrongKey: (result) => this.onWrongKey(result),
      onProgress: (result) => this.renderTypedState(result),
    });
  }

  init() {
    this.cacheElements();
    this.bindEvents();
    this.renderModules();
    this.renderLessons();
    this.setCurrentLesson(this.currentLessonId, { save: false });
  }

  cacheElements() {
    this.modulesEl = this.root.querySelector("#tutorial-modules");
    this.lessonsEl = this.root.querySelector("#tutorial-lessons");
    this.mainEl = this.root.querySelector("#tutorial-main");
    this.titleEl = this.root.querySelector("#tutorial-title");
    this.groupLabelEl = this.root.querySelector("#tutorial-group-label");
    this.riskLabelEl = this.root.querySelector("#tutorial-risk-label");
    this.commandNameEl = this.root.querySelector("#tutorial-command-name");
    this.keysEl = this.root.querySelector("#tutorial-key-bindings");
    this.descriptionEl = this.root.querySelector("#tutorial-description");
    this.stepEl = this.root.querySelector("#tutorial-step");
    this.typedEl = this.root.querySelector("#tutorial-typed");
    this.feedbackEl = this.root.querySelector("#tutorial-feedback");
    this.sandboxEl = this.root.querySelector("#tutorial-sandbox");
    this.progressSummaryEl = this.root.querySelector("#tutorial-progress-summary");
    this.prevButton = this.root.querySelector("#tutorial-prev");
    this.nextButton = this.root.querySelector("#tutorial-next");
    this.markReadButton = this.root.querySelector("#tutorial-mark-read");
    this.resetButton = this.root.querySelector("#tutorial-reset");
  }

  bindEvents() {
    this.prevButton.addEventListener("click", () => this.goToRelativeLesson(-1));
    this.nextButton.addEventListener("click", () => this.goToRelativeLesson(1));
    this.markReadButton.addEventListener("click", () => this.completeCurrentLesson("Read."));
    this.resetButton.addEventListener("click", async () => {
      this.progress = await resetTutorialProgress();
      this.advanceState = null;
      this.currentStepIndex = 0;
      this.renderAll();
      this.updateTracker();
      this.setFeedback("Progress reset.", "success");
    });

    document.addEventListener(
      "keydown",
      (event) => {
        if (this.shouldIgnoreKeydown(event)) return;
        const result = this.tracker.handleKeydown(event);
        if (result.status === "empty") return;
        this.renderTypedState(result);
      },
      true,
    );
  }

  shouldIgnoreKeydown(event) {
    if (event.metaKey || (event.ctrlKey && ["r", "l", "w"].includes(event.key?.toLowerCase()))) {
      return true;
    }
    const activeElement = document.activeElement;
    const isControlFocused = activeElement?.closest?.("button, a");
    return isControlFocused && ["Enter", " "].includes(event.key);
  }

  renderAll() {
    this.renderModules();
    this.renderLessons();
    this.renderLesson();
  }

  get lessonsByGroup() {
    return Object.groupBy(this.lessons, (lesson) => lesson.group);
  }

  get currentLesson() {
    return this.lessons.find((lesson) => lesson.id === this.currentLessonId) || this.lessons[0];
  }

  get currentGroup() {
    return this.currentLesson?.group;
  }

  getCurrentSteps() {
    const lesson = this.currentLesson;
    const commandSequences = getAcceptedSequencesForCommand(
      this.commandToOptionsToKeys,
      lesson.command,
    );
    if (commandSequences.length === 0) return [];

    return [
      {
        type: "command",
        prompt: `Press the mapped key sequence for ${lesson.command}.`,
        acceptedSequences: commandSequences,
      },
      ...lesson.followUpSteps.map((step) => ({
        ...step,
        acceptedSequences: [step.sequence],
      })),
    ];
  }

  getCurrentStep() {
    return this.getCurrentSteps()[this.currentStepIndex];
  }

  getAdvanceHintKey() {
    const settings = Settings.getSettings();
    const hintKeys = settings.filterLinkHints
      ? settings.linkHintNumbers
      : settings.linkHintCharacters;
    return hintKeys?.[0]?.toLowerCase() || "s";
  }

  getAdvanceSteps() {
    const hintKey = this.getAdvanceHintKey();
    const linkHintSequences = getAcceptedSequencesForCommand(
      this.commandToOptionsToKeys,
      "LinkHints.activateMode",
    );
    if (linkHintSequences.length === 0) return [];

    return [
      {
        type: "advance-command",
        prompt: this.getAdvanceTeachingPrompt(linkHintSequences, hintKey),
        acceptedSequences: linkHintSequences,
        successText: "Link hints are active. Type the hint on Next.",
      },
      {
        type: "advance-hint",
        label: hintKey,
        prompt: "Type the hint shown on the Next button.",
        acceptedSequences: [[hintKey]],
        successText: "Next selected.",
      },
    ];
  }

  getAdvanceTeachingPrompt(linkHintSequences, hintKey) {
    const keyLabels = getKeysForCommand(this.commandToOptionsToKeys, "LinkHints.activateMode");
    const linkHintKey = keyLabels[0] || linkHintSequences[0]?.join("") || "f";
    return "Vimium selects clickable things with link hints: first press " +
      `${linkHintKey} to place yellow labels on links and buttons, then type the label on the ` +
      `target. For the Next button here, the label will be ${hintKey}.`;
  }

  getActiveStep() {
    if (this.advanceState) {
      return this.getAdvanceSteps()[this.advanceState.stepIndex];
    }
    return this.getCurrentStep();
  }

  async setCurrentLesson(lessonId, { save = true } = {}) {
    if (!this.lessons.find((lesson) => lesson.id === lessonId)) {
      lessonId = this.lessons[0]?.id;
    }
    this.currentLessonId = lessonId;
    this.advanceState = null;
    this.currentStepIndex = 0;
    this.lessonStartedAt = Date.now();
    const lesson = this.currentLesson;
    this.progress = setCurrentLesson(this.progress, lesson.group, lesson.id);
    if (save) await this.saveProgress(this.progress);
    this.renderAll();
    this.updateTracker();
  }

  updateTracker() {
    const step = this.getActiveStep();
    this.tracker.setAcceptedSequences(step?.acceptedSequences || [], {
      allowCountPrefix: step?.type === "command" || step?.type === "advance-command",
    });
  }

  renderModules() {
    this.modulesEl.textContent = "";
    const completed = new Set(this.progress.completedLessonIds);
    for (const [group, lessons] of Object.entries(this.lessonsByGroup)) {
      const requiredIds = lessons
        .map((lesson) => lesson.id)
        .filter((id) => this.requiredLessonIds.includes(id));
      const doneCount = requiredIds.filter((id) => completed.has(id)).length;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tutorial-module";
      if (group === this.currentGroup) button.classList.add("active");
      button.addEventListener("click", () => this.setCurrentLesson(lessons[0].id));

      const title = document.createElement("span");
      title.textContent = groupTitles[group] || group;
      button.appendChild(title);

      const progress = document.createElement("span");
      progress.className = "tutorial-module-progress";
      progress.textContent = `${doneCount}/${requiredIds.length} complete`;
      button.appendChild(progress);
      this.modulesEl.appendChild(button);
    }

    const total = this.requiredLessonIds.length;
    const done = this.requiredLessonIds
      .filter((id) => completed.has(id)).length;
    this.progressSummaryEl.textContent = `${done}/${total} mapped lessons complete`;
  }

  renderLessons() {
    this.lessonsEl.textContent = "";
    const completed = new Set(this.progress.completedLessonIds);
    for (const lesson of this.lessonsByGroup[this.currentGroup] || []) {
      const keys = getKeysForCommand(this.commandToOptionsToKeys, lesson.command);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tutorial-lesson";
      if (lesson.id === this.currentLessonId) button.classList.add("active");
      if (completed.has(lesson.id)) button.classList.add("completed");
      if (keys.length === 0) button.classList.add("unbound");
      button.addEventListener("click", () => this.setCurrentLesson(lesson.id));

      const title = document.createElement("span");
      title.className = "tutorial-lesson-title";
      title.textContent = lesson.title;
      button.appendChild(title);

      const meta = document.createElement("span");
      meta.className = "tutorial-lesson-meta";
      meta.textContent = keys.length > 0 ? keys.join(", ") : "No mapped key";
      button.appendChild(meta);
      this.lessonsEl.appendChild(button);
    }
  }

  renderLesson() {
    const lesson = this.currentLesson;
    const keys = getKeysForCommand(this.commandToOptionsToKeys, lesson.command);
    this.mainEl.classList.toggle("unbound", keys.length === 0);
    this.groupLabelEl.textContent = groupTitles[lesson.group] || lesson.group;
    this.titleEl.textContent = lesson.title;
    this.commandNameEl.textContent = lesson.command;
    this.descriptionEl.textContent = lesson.description;
    this.riskLabelEl.textContent = lesson.risk === "simulated" ? "Simulated" : "Page-local";
    this.renderKeyBindings(keys);
    this.renderStep();
    this.renderSandbox();
    this.renderTypedState({ status: "reset" });
    this.prevButton.disabled = this.getLessonIndex() === 0;
    this.nextButton.disabled = this.getLessonIndex() === this.lessons.length - 1;
  }

  renderStep() {
    const steps = this.advanceState ? this.getAdvanceSteps() : this.getCurrentSteps();
    const stepIndex = this.advanceState ? this.advanceState.stepIndex : this.currentStepIndex;
    const step = steps[stepIndex];
    this.stepEl.textContent = "";
    if (!step) {
      this.stepEl.textContent = "This command is not currently mapped. Add a mapping in Vimium " +
        "options, then reload this page to practice it here.";
      return;
    }

    const strong = document.createElement("strong");
    strong.textContent = this.advanceState
      ? `Continue ${stepIndex + 1}/${steps.length}: `
      : `Step ${stepIndex + 1}/${steps.length}: `;
    this.stepEl.appendChild(strong);
    this.stepEl.appendChild(document.createTextNode(step.prompt));
    if (step.label) {
      const label = document.createElement("span");
      label.className = "tutorial-step-label";
      label.textContent = ` ${step.label}`;
      this.stepEl.appendChild(label);
    }
  }

  renderKeyBindings(keys) {
    this.keysEl.textContent = "";
    if (keys.length === 0) {
      const empty = document.createElement("span");
      empty.className = "tutorial-lesson-meta";
      empty.textContent = "Unmapped";
      this.keysEl.appendChild(empty);
      return;
    }
    for (const key of keys) {
      const block = document.createElement("div");
      block.className = "key-block";
      const keyEl = document.createElement("span");
      keyEl.className = "key";
      keyEl.textContent = key;
      const comma = document.createElement("span");
      comma.className = "comma";
      comma.textContent = ",";
      block.append(keyEl, comma);
      this.keysEl.appendChild(block);
    }
  }

  renderSandbox() {
    const lesson = this.currentLesson;
    this.stageState = {
      row: 2,
      col: 1,
      scrollPercent: 35,
      activeTabIndex: 2,
      zoom: 100,
      findIndex: 0,
      linkSelected: false,
    };
    this.sandboxEl.textContent = "";
    this.sandboxEl.appendChild(this.createStageHeader(lesson));
    const body = document.createElement("div");
    body.className = "tutorial-stage-body";

    switch (lesson.effect) {
      case "link-hints":
        body.appendChild(this.createLinkHintsStage());
        break;
      case "tabs":
      case "history":
      case "zoom":
        body.appendChild(this.createTabsStage());
        break;
      case "find":
      case "find-next":
      case "find-prev":
      case "find-selected":
        body.appendChild(this.createFindStage());
        break;
      case "vomnibar":
        body.appendChild(this.createVomnibarStage());
        break;
      default:
        body.appendChild(this.createPageStage());
    }

    const state = document.createElement("p");
    state.className = "tutorial-stage-state";
    state.textContent = "Waiting for input.";
    body.appendChild(state);
    this.sandboxEl.appendChild(body);
    this.renderStageFeedback();
  }

  createStageHeader(lesson) {
    const header = document.createElement("div");
    header.className = "tutorial-stage-header";
    const left = document.createElement("span");
    left.textContent = lesson.sandboxSetup === "sandbox" ? "Sandbox simulation" : "Practice page";
    const right = document.createElement("span");
    right.textContent = lesson.kind;
    header.append(left, right);
    return header;
  }

  createPageStage() {
    const wrapper = document.createElement("div");
    const motion = document.createElement("div");
    motion.className = "tutorial-motion-board";
    motion.innerHTML = `
      <div class="tutorial-motion-token">viewport</div>
      <div class="tutorial-motion-row">Top section</div>
      <div class="tutorial-motion-row">Intro links</div>
      <div class="tutorial-motion-row">Reading area</div>
      <div class="tutorial-motion-row">Needle result</div>
      <div class="tutorial-motion-row">Bottom section</div>
      <div class="tutorial-scroll-meter"><span></span></div>
    `;

    const input = document.createElement("input");
    input.className = "tutorial-fake-input";
    input.placeholder = "Focusable practice input";
    input.type = "text";

    const pane = document.createElement("div");
    pane.className = "tutorial-scroll-pane";
    const content = document.createElement("div");
    content.className = "tutorial-wide-content";
    content.innerHTML = `
      <p>Top of the practice page. This area is intentionally scrollable.</p>
      <p><a class="tutorial-fake-link">Previous</a> content, section links, and fields live here.</p>
      <p>Use movement drills to build distance and direction memory.</p>
      <p>Middle content with a <span class="tutorial-highlight">needle</span> for find drills.</p>
      <p>More text follows so page-level movement has visible feedback.</p>
      <p>Bottom of the practice page.</p>
    `;
    pane.appendChild(content);
    wrapper.append(
      motion,
      input,
      document.createElement("br"),
      document.createElement("br"),
      pane,
    );
    return wrapper;
  }

  createLinkHintsStage() {
    const wrapper = document.createElement("div");
    const firstHint = this.currentLesson.followUpSteps[0]?.sequence[0] || "s";
    for (
      const [hint, text] of [
        [firstHint, "Open project docs"],
        ["a", "Read command listing"],
        ["d", "Review options"],
      ]
    ) {
      const row = document.createElement("p");
      const marker = document.createElement("span");
      marker.className = "tutorial-hint";
      marker.textContent = hint;
      const link = document.createElement("a");
      link.className = "tutorial-fake-link";
      link.textContent = text;
      row.append(marker, link);
      wrapper.appendChild(row);
    }
    return wrapper;
  }

  createTabsStage() {
    const wrapper = document.createElement("div");
    const strip = document.createElement("div");
    strip.className = "tutorial-tab-strip";
    for (const [index, title] of ["Docs", "Issue", "Current", "Search"].entries()) {
      const tab = document.createElement("div");
      tab.className = "tutorial-tab";
      tab.dataset.index = index;
      if (title === "Current") tab.classList.add("active");
      tab.textContent = title;
      strip.appendChild(tab);
    }
    const text = document.createElement("p");
    text.textContent = "Tab, history, and zoom commands update this simulated browser strip.";
    wrapper.append(strip, text);
    return wrapper;
  }

  createFindStage() {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <p>Search text appears here. The first needle is near the start.</p>
      <p>Another paragraph keeps the second needle visible for next-match drills.</p>
      <p>Selected text can also become a find query.</p>
    `;
    return wrapper;
  }

  createVomnibarStage() {
    const wrapper = document.createElement("div");
    const input = document.createElement("div");
    input.className = "tutorial-fake-input";
    input.textContent = "Vomnibar query";
    const list = document.createElement("ul");
    for (const item of ["History result", "Bookmark result", "Open tab", "Command result"]) {
      const row = document.createElement("li");
      row.textContent = item;
      list.appendChild(row);
    }
    wrapper.append(input, list);
    return wrapper;
  }

  renderTypedState(result) {
    if (result.status === "count") {
      this.typedEl.textContent = `Count prefix: ${result.count}`;
    } else if (result.status === "partial") {
      const count = result.count ? `${result.count} ` : "";
      this.typedEl.textContent = `Typed: ${count}${result.typedSequence.join(" ")}`;
    } else if (result.status === "reset") {
      this.typedEl.textContent = "";
    }
  }

  async onStepSuccess(result) {
    if (this.advanceState) {
      await this.onAdvanceStepSuccess(result);
      return;
    }

    const step = this.getCurrentStep();
    this.applyStepEffect(step, result);
    const steps = this.getCurrentSteps();
    if (this.currentStepIndex < steps.length - 1) {
      this.currentStepIndex++;
      this.updateTracker();
      this.renderStep();
      this.renderTypedState({ status: "reset" });
      this.setFeedback(step.successText || "Good. Continue with the next step.", "success");
      return;
    }

    const canAdvanceWithHints = this.getLessonIndex() < this.lessons.length - 1 &&
      this.getAdvanceSteps().length > 0;
    const message = canAdvanceWithHints
      ? "Lesson complete. Now use link hints to select Next."
      : "Lesson complete.";
    await this.completeCurrentLesson(message, result);
  }

  async onAdvanceStepSuccess(result) {
    const step = this.getActiveStep();
    if (step?.type === "advance-command") {
      this.advanceState.stepIndex++;
      this.renderStep();
      this.renderAdvanceHint();
      this.renderTypedState({ status: "reset" });
      this.updateTracker();
      this.setFeedback(step.successText, "success");
      return;
    }

    this.setFeedback(step?.successText || "Next selected.", "success");
    this.advanceState = null;
    this.clearAdvanceHint();
    await this.goToRelativeLesson(1);
  }

  async onWrongKey(result) {
    this.progress = recordLessonAttempt(this.progress, this.currentLesson.id, { success: false });
    await this.saveProgress(this.progress);
    this.renderModules();
    this.renderLessons();
    this.setFeedback(`Unexpected key: ${result.keyString}.`, "error");
  }

  applyStepEffect(step, result) {
    const state = this.sandboxEl.querySelector(".tutorial-stage-state");
    const pane = this.sandboxEl.querySelector(".tutorial-scroll-pane");
    const input = this.sandboxEl.querySelector(".tutorial-fake-input");
    const activeTab = this.sandboxEl.querySelector(".tutorial-tab.active");
    const lesson = this.currentLesson;

    switch (lesson.effect) {
      case "scroll-down":
        this.stageState.row = Math.min(4, this.stageState.row + (result.count || 1));
        this.stageState.scrollPercent = Math.min(100, this.stageState.scrollPercent + 16);
        if (pane) pane.scrollTop += result.count ? result.count * 30 : 70;
        break;
      case "scroll-up":
        this.stageState.row = Math.max(0, this.stageState.row - (result.count || 1));
        this.stageState.scrollPercent = Math.max(0, this.stageState.scrollPercent - 16);
        if (pane) pane.scrollTop -= result.count ? result.count * 30 : 70;
        break;
      case "scroll-top":
        this.stageState.row = 0;
        this.stageState.scrollPercent = 0;
        if (pane) pane.scrollTop = 0;
        break;
      case "scroll-bottom":
        this.stageState.row = 4;
        this.stageState.scrollPercent = 100;
        if (pane) pane.scrollTop = pane.scrollHeight;
        break;
      case "scroll-left":
        this.stageState.col = Math.max(0, this.stageState.col - 1);
        if (pane) pane.scrollLeft -= 80;
        break;
      case "scroll-right":
        this.stageState.col = Math.min(2, this.stageState.col + 1);
        if (pane) pane.scrollLeft += 80;
        break;
      case "scroll-left-edge":
        this.stageState.col = 0;
        if (pane) pane.scrollLeft = 0;
        break;
      case "scroll-right-edge":
        this.stageState.col = 2;
        if (pane) pane.scrollLeft = pane.scrollWidth;
        break;
      case "focus-input":
        input?.focus();
        input?.classList.add("tutorial-active-target");
        break;
      case "link-hints":
        this.stageState.linkSelected = step?.type === "literal";
        break;
      case "tabs":
      case "history":
      case "zoom":
        this.applyTabEffect(lesson.command, result);
        break;
      case "find":
      case "find-next":
      case "find-prev":
      case "find-selected":
        this.stageState.findIndex++;
        break;
    }

    this.renderStageFeedback();
    if (state) {
      state.textContent = step?.successText || `${lesson.command} accepted in the sandbox.`;
    }
  }

  applyTabEffect(command, result) {
    if (command === "previousTab" || command === "goBack") {
      this.stageState.activeTabIndex = Math.max(0, this.stageState.activeTabIndex - 1);
    } else if (command === "nextTab" || command === "goForward") {
      this.stageState.activeTabIndex = Math.min(3, this.stageState.activeTabIndex + 1);
    } else if (command === "firstTab") {
      this.stageState.activeTabIndex = 0;
    } else if (command === "lastTab") {
      this.stageState.activeTabIndex = 3;
    } else if (command === "zoomIn") {
      this.stageState.zoom += (result.count || 1) * 10;
    } else if (command === "zoomOut") {
      this.stageState.zoom -= (result.count || 1) * 10;
    } else if (command === "zoomReset") {
      this.stageState.zoom = 100;
    }
  }

  renderStageFeedback() {
    const token = this.sandboxEl.querySelector(".tutorial-motion-token");
    if (token) {
      token.style.transform = `translate(${this.stageState.col * 78}px, ${
        this.stageState.row * 34
      }px)`;
    }

    const meter = this.sandboxEl.querySelector(".tutorial-scroll-meter span");
    if (meter) {
      meter.style.width = `${this.stageState.scrollPercent}%`;
    }

    for (const row of this.sandboxEl.querySelectorAll(".tutorial-motion-row")) {
      row.classList.remove("active");
    }
    this.sandboxEl.querySelectorAll(".tutorial-motion-row")[this.stageState.row]?.classList.add(
      "active",
    );

    for (const tab of this.sandboxEl.querySelectorAll(".tutorial-tab")) {
      tab.classList.toggle(
        "active",
        parseInt(tab.dataset.index) === this.stageState.activeTabIndex,
      );
    }

    const zoomText = this.sandboxEl.querySelector(".tutorial-stage-state");
    if (zoomText && ["zoomIn", "zoomOut", "zoomReset"].includes(this.currentLesson.command)) {
      zoomText.textContent = `Sandbox zoom: ${this.stageState.zoom}%`;
    }

    const link = this.sandboxEl.querySelector(".tutorial-fake-link");
    if (link) {
      link.classList.toggle("tutorial-selected-link", this.stageState.linkSelected);
    }

    const highlights = this.sandboxEl.querySelectorAll(".tutorial-highlight");
    for (const highlight of highlights) {
      highlight.classList.toggle("active", this.stageState.findIndex > 0);
    }
  }

  async completeCurrentLesson(message, result = {}, { startAdvance = true } = {}) {
    const elapsedMs = Math.max(0, Date.now() - this.lessonStartedAt);
    this.progress = recordLessonAttempt(this.progress, this.currentLesson.id, {
      success: true,
      elapsedMs,
    });
    await this.saveProgress(this.progress);
    this.renderModules();
    this.renderLessons();
    this.setFeedback(message, "success");
    if (
      startAdvance && this.getLessonIndex() < this.lessons.length - 1 &&
      this.getAdvanceSteps().length > 0
    ) {
      this.startAdvanceMode();
    } else {
      this.updateTracker();
    }
  }

  startAdvanceMode() {
    this.advanceState = { stepIndex: 0 };
    this.renderStep();
    this.renderAdvanceHint();
    this.renderTypedState({ status: "reset" });
    this.updateTracker();
  }

  renderAdvanceHint() {
    this.clearAdvanceHint();
    this.mainEl.classList.add("tutorial-advance-mode");
    const step = this.getActiveStep();
    if (step?.type !== "advance-hint") return;

    const hint = document.createElement("span");
    hint.className = "tutorial-control-hint";
    hint.textContent = this.getAdvanceHintKey();
    this.nextButton.appendChild(hint);
  }

  clearAdvanceHint() {
    this.mainEl.classList.remove("tutorial-advance-mode");
    for (const hint of this.root.querySelectorAll(".tutorial-control-hint")) {
      hint.remove();
    }
  }

  setFeedback(message, className = "") {
    this.feedbackEl.className = className;
    this.feedbackEl.textContent = message;
  }

  getLessonIndex() {
    return this.lessons.findIndex((lesson) => lesson.id === this.currentLesson.id);
  }

  async goToRelativeLesson(delta) {
    const index = this.getLessonIndex();
    const next = this.lessons[index + delta];
    if (next) await this.setCurrentLesson(next.id);
  }
}

async function getCommandToOptionsToKeys() {
  const items = await chrome.storage.session.get("commandToOptionsToKeys");
  return items.commandToOptionsToKeys || {};
}

async function initTutorialPage(options = {}) {
  const root = options.root || document.querySelector("#tutorial-app");
  if (!root) throw new Error("Tutorial root element not found.");

  await Settings.onLoaded();
  if (!options.skipCommandsInit) {
    await Commands.init();
  }
  const settings = options.settings || Settings.getSettings();
  const commandToOptionsToKeys = options.commandToOptionsToKeys ||
    await getCommandToOptionsToKeys();
  const lessons = options.lessons || createTutorialLessons({ settings });
  const allLessonIds = lessons.map((lesson) => lesson.id);
  const progress = options.progress || await loadTutorialProgress(allLessonIds);

  const app = new TutorialApp({
    root,
    lessons,
    commandToOptionsToKeys,
    progress,
    saveProgress: options.saveProgress,
  });
  app.init();
  return app;
}

const testEnv = globalThis.window == null ||
  globalThis.window.location?.search.includes("dom_tests=true");
if (!testEnv) {
  document.addEventListener("DOMContentLoaded", () => initTutorialPage());
}

export { initTutorialPage, TutorialApp };

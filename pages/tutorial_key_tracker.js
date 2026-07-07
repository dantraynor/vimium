function sequencesEqual(a, b) {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

function sequenceStartsWith(sequence, prefix) {
  return prefix.length <= sequence.length &&
    prefix.every((key, index) => key === sequence[index]);
}

function isCountKey(keyString, countPrefix) {
  if (!keyString || keyString.length !== 1) return false;
  if (countPrefix.length === 0) return "1" <= keyString && keyString <= "9";
  return "0" <= keyString && keyString <= "9";
}

class TutorialKeyTracker {
  constructor(options = {}) {
    this.getKeyString = options.getKeyString ||
      ((event) => globalThis.KeyboardUtils.getKeyCharString(event));
    this.onProgress = options.onProgress || (() => {});
    this.onSuccess = options.onSuccess || (() => {});
    this.onWrongKey = options.onWrongKey || (() => {});
    this.setAcceptedSequences(options.acceptedSequences || [], {
      allowCountPrefix: options.allowCountPrefix,
    });
  }

  setAcceptedSequences(acceptedSequences, { allowCountPrefix = true } = {}) {
    this.acceptedSequences = acceptedSequences;
    this.allowCountPrefix = allowCountPrefix;
    this.reset();
  }

  reset() {
    this.typedSequence = [];
    this.countPrefix = "";
  }

  handleKeydown(event) {
    const keyString = this.getKeyString(event);
    const result = this.handleKeyString(keyString);
    if (!["ignored", "empty"].includes(result.status)) {
      event.preventDefault?.();
      event.stopPropagation?.();
    }
    return result;
  }

  handleKeyString(keyString) {
    if (!keyString) return { status: "ignored" };
    if (this.acceptedSequences.length === 0) return { status: "empty" };

    const startsAcceptedSequence = this.acceptedSequences.some((sequence) =>
      sequence[0] === keyString
    );
    if ((keyString === "<escape>" || keyString === "escape") && !startsAcceptedSequence) {
      this.reset();
      const result = { status: "reset" };
      this.onProgress(result);
      return result;
    }

    if (
      this.allowCountPrefix && this.typedSequence.length === 0 && !startsAcceptedSequence &&
      isCountKey(keyString, this.countPrefix)
    ) {
      this.countPrefix += keyString;
      const result = {
        status: "count",
        count: parseInt(this.countPrefix),
        typedSequence: [],
      };
      this.onProgress(result);
      return result;
    }

    const nextSequence = this.typedSequence.concat([keyString]);
    const matches = this.acceptedSequences.filter((sequence) =>
      sequenceStartsWith(sequence, nextSequence)
    );

    if (matches.length === 0) {
      const result = {
        status: "wrong",
        keyString,
        count: this.countPrefix ? parseInt(this.countPrefix) : null,
        typedSequence: nextSequence,
      };
      this.reset();
      this.onWrongKey(result);
      return result;
    }

    const exactMatch = matches.find((sequence) => sequencesEqual(sequence, nextSequence));
    if (exactMatch) {
      const result = {
        status: "success",
        count: this.countPrefix ? parseInt(this.countPrefix) : null,
        sequence: exactMatch,
      };
      this.reset();
      this.onSuccess(result);
      return result;
    }

    this.typedSequence = nextSequence;
    const result = {
      status: "partial",
      count: this.countPrefix ? parseInt(this.countPrefix) : null,
      typedSequence: this.typedSequence.slice(),
    };
    this.onProgress(result);
    return result;
  }
}

export { TutorialKeyTracker };

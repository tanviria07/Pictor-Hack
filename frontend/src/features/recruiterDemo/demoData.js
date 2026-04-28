export const DEMO_STEPS = {
  INITIAL: "INITIAL",
  LOADED: "LOADED",
  AFTER_RUN: "AFTER_RUN",
  AFTER_TRACE: "AFTER_TRACE",
  CORRECTED: "CORRECTED",
};

export function startDemo() {
  return {
    problemId: "contains-duplicate",
    step: DEMO_STEPS.INITIAL,
  };
}

export function getDemoInstructions(step) {
  switch (step) {
    case DEMO_STEPS.LOADED:
      return "Step 1: Notice the pre-filled code has an efficiency flaw (O(n^2)). Click 'Run Code' to see the evaluation.";
    case DEMO_STEPS.AFTER_RUN:
      return "Step 2: The code passes visible tests but fails hidden performance tests. Look at the Interview Trace below.";
    case DEMO_STEPS.AFTER_TRACE:
      return "Step 3: The AI identified the O(n^2) risk. Click 'Apply Optimized' to see the O(n) fix and a Cloud follow-up.";
    case DEMO_STEPS.CORRECTED:
      return "Step 4: Now we have O(n) space/time tradeoff. Jose Jose asked about production scaling below.";
    default:
      return "";
  }
}

export function getDemoCode(step) {
  if (step === DEMO_STEPS.LOADED) {
    return `def containsDuplicate(nums: list[int]) -> bool:
    # Intentionally inefficient O(n^2) for demo
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] == nums[j]:
                return True
    return False`;
  }
  return null;
}

export function getDemoCorrectedCode() {
  return `def containsDuplicate(nums: list[int]) -> bool:
    # Optimized O(n) using a set
    seen = set()
    for n in nums:
        if n in seen:
            return True
        seen.add(n)
    return False`;
}

export function getDemoCloudPrompt() {
  return `Follow-up (Cloud Architect Mode):
How would your solution change if 'nums' was 500GB and stored in distributed S3 buckets?
- I'd use a MapReduce pattern (e.g. Spark).
- Partition data by hash range.
- Check duplicates within each partition locally.`;
}

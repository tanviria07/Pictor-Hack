import { test, expect } from "@playwright/test";
const problemSummary = {
    id: "two-sum",
    title: "Two Sum",
    difficulty: "easy",
    category: "arrays-hashing",
    category_title: "Arrays & Hashing",
    function_name: "twoSum",
    company_tags: ["Google", "Amazon"],
};
const problemDetail = {
    ...problemSummary,
    description: "Find two numbers that add up to the target.",
    examples: [
        { input: "nums = [2,7,11,15], target = 9", output: "[0,1]" },
    ],
    constraints: ["2 <= nums.length <= 10^4", "You may not use the same element twice."],
    parameters: [
        { name: "nums", type: "List[int]" },
        { name: "target", type: "int" },
    ],
    expected_return_type: "List[int]",
    visible_test_count: 1,
    hidden_test_count: 1,
};
const runResponse = {
    status: "correct",
    evaluation: {
        status: "correct",
        syntax_ok: true,
        function_found: true,
        signature_ok: true,
        passed_visible_tests: 1,
        total_visible_tests: 1,
        passed_hidden_tests: 1,
        total_hidden_tests: 1,
        error_type: null,
        error_message: null,
        failing_case_summary: null,
        likely_stage: "done",
        feedback_targets: [],
    },
    visible_test_results: [{ index: 0, passed: true, label: "Example" }],
    interviewer_feedback: "Looks good.",
};
async function mockApis(page) {
    let saveCount = 0;
    await page.route("**/api/problems/two-sum", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(problemDetail),
        });
    });
    await page.route("**/api/problems", async (route) => {
        if (route.request().method() !== "GET") {
            await route.continue();
            return;
        }
        const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
        if (path !== "/api/problems") {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([problemSummary]),
        });
    });
    await page.route("**/api/categories", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: "[]",
        });
    });
    await page.route("**/api/session/two-sum", async (route) => {
        if (route.request().method() === "GET") {
            await route.fulfill({ status: 404, body: "{}" });
            return;
        }
        await route.continue();
    });
    await page.route("**/api/run", async (route) => {
        if (route.request().method() !== "POST") {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(runResponse),
        });
    });
    await page.route("**/api/session/save", async (route) => {
        saveCount += 1;
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
        });
    });
    return { getSaveCount: () => saveCount };
}
test.describe("Workspace (mocked API)", () => {
    test("loads problem, edits code, runs, persists session", async ({ page, }) => {
        const { getSaveCount } = await mockApis(page);
        await page.goto("/");
        await expect(page.getByRole("button", { name: "Two Sum" })).toBeVisible({
            timeout: 30_000,
        });
        await page.getByTestId("problem-item-two-sum").click();
        await expect(page.getByRole("heading", { name: "Two Sum" })).toBeVisible();
        const editor = page.getByTestId("python-editor");
        await editor.click();
        await editor.fill("def twoSum(nums, target):\n    return [0, 1]\n");
        await page.getByTestId("run-code-button").click();
        await expect(page.getByText("Looks good.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("All tests passed")).toBeVisible();
        await expect
            .poll(() => getSaveCount(), { timeout: 10_000 })
            .toBeGreaterThan(0);
    });
    test("shows friendly banner for syntax_error run result", async ({ page }) => {
        await page.route("**/api/problems/two-sum", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(problemDetail),
            });
        });
        await page.route("**/api/problems", async (route) => {
            if (route.request().method() !== "GET") {
                await route.continue();
                return;
            }
            const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
            if (path !== "/api/problems") {
                await route.continue();
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([problemSummary]),
            });
        });
        await page.route("**/api/categories", async (route) => {
            await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
        });
        await page.route("**/api/session/two-sum", async (route) => {
            await route.fulfill({ status: 404, body: "{}" });
        });
        await page.route("**/api/run", async (route) => {
            const syn = {
                status: "syntax_error",
                evaluation: {
                    status: "syntax_error",
                    syntax_ok: false,
                    function_found: false,
                    signature_ok: false,
                    passed_visible_tests: 0,
                    total_visible_tests: 0,
                    passed_hidden_tests: 0,
                    total_hidden_tests: 0,
                    error_type: "SyntaxError",
                    error_message: "invalid syntax",
                    failing_case_summary: null,
                    likely_stage: "parse",
                    feedback_targets: ["Fix parsing before running tests."],
                },
                visible_test_results: [],
                interviewer_feedback: "",
            };
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(syn),
            });
        });
        await page.route("**/api/session/save", async (route) => {
            await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
        });
        await page.goto("/");
        await page.getByTestId("problem-item-two-sum").click({ timeout: 30_000 });
        await page.getByTestId("run-code-button").click();
        await expect(page.getByTestId("evaluation-banner")).toContainText("Python could not parse");
    });
    test("filters by unofficial company practice track", async ({ page }) => {
        await mockApis(page);
        await page.goto("/");
        await expect(page.getByText("Company Practice Tracks")).toBeVisible({
            timeout: 30_000,
        });
        await page.getByRole("button", { name: /Google/ }).click();
        await expect(page.getByTestId("problem-item-two-sum")).toBeVisible();
        await page.getByRole("button", { name: /Microsoft/ }).click();
        await expect(page.getByText("No problems found for this company/filter yet.")).toBeVisible();
    });
});

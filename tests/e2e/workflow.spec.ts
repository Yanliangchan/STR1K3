import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "DemoPassword123!";

async function signIn(page: Page, email = "instructor@example.com") {
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

async function count(page: Page, id: string) {
  await page.goto("/");
  return Number(await page.getByTestId(id).locator("[data-value]").getAttribute("data-value"));
}

test("definition of done: bulk statements, independent review, counts, persistence, batch isolation", async ({ page }) => {
  // 1-2. Sign in and land directly on the active batch.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await signIn(page);
  await expect(page.getByTestId("active-batch-name")).toHaveText("14/26 MDST");

  const before = {
    statements: await count(page, "count-statements"),
    pending: await count(page, "count-pending"),
    rewrite: await count(page, "count-rewrite"),
    accepted: await count(page, "count-accepted"),
    notSubmitted: await count(page, "count-not-submitted"),
  };

  // 3-4. Find several cadets and select them.
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Cadets" }).click();
  await page.getByLabel("Search cadets").fill("Byte 1");
  await expect(page).toHaveURL(/q=Byte\+1|q=Byte%201/);
  const boxes = page.locator("ul.md\\:hidden input[type=checkbox]");
  const names: string[] = [];
  for (let i = 0; i < 3; i++) {
    await boxes.nth(i).check();
    names.push(((await boxes.nth(i).getAttribute("aria-label")) ?? "").replace("Select ", ""));
  }
  await expect(page.getByText("3 cadets selected")).toBeVisible();

  // 5. Create statement records for all of them in one operation.
  await page.getByTestId("create-record-for-selected").click();
  await page.getByText("Statement", { exact: true }).click();
  await expect(page.getByTestId("selected-cadets").locator("li")).toHaveCount(3);
  await page.getByLabel("Statement required for").fill("E2E: account for your movements on Tuesday evening.");
  await page.getByTestId("review-entries").click();
  await expect(page.getByTestId("review-summary")).toContainText("3 individual statement requests will be created");
  await page.getByTestId("confirm-create").click();
  const success = page.getByTestId("entry-success");
  await expect(success).toContainText("3 statement requests created");

  // 6. Each cadet has a separate workflow.
  const links = success.getByRole("link", { name: /View/ });
  const hrefs = await Promise.all([0, 1, 2].map((i) => links.nth(i).getAttribute("href")));
  expect(new Set(hrefs).size).toBe(3);

  // 7. Mark one Pending review.
  await page.goto(hrefs[0]!);
  await page.getByLabel("Statement content").fill("I was in the study room.");
  await page.getByTestId("record-receipt").click();
  await expect(page.getByText("Pending review").first()).toBeVisible();

  // 8. Request a rewrite for another.
  await page.goto(hrefs[1]!);
  await page.getByTestId("record-receipt").click();
  await page.getByTestId("request-rewrite").waitFor();
  await page.getByLabel("Feedback to cadet").fill("Include times and witnesses.");
  await page.getByTestId("request-rewrite").click();
  await expect(page.getByText("Record rewritten statement")).toBeVisible();

  // 9. Accept a third.
  await page.goto(hrefs[2]!);
  await page.getByTestId("record-receipt").click();
  await page.getByTestId("accept-statement").click();
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();

  // 10. Dashboard reflects the change immediately.
  expect(await count(page, "count-statements")).toBe(before.statements + 3);
  expect(await count(page, "count-pending")).toBe(before.pending + 1);
  expect(await count(page, "count-rewrite")).toBe(before.rewrite + 1);
  expect(await count(page, "count-accepted")).toBe(before.accepted + 1);
  expect(await count(page, "count-not-submitted")).toBe(before.notSubmitted);

  // 11. Cadet profile shows the record history.
  await page.goto(hrefs[1]!);
  await page.getByRole("link", { name: names[1]! }).first().click();
  await expect(page.getByTestId("cadet-name")).toHaveText(names[1]!);
  await expect(page.getByTestId("cadet-history")).toContainText("E2E: account for your movements");
  await expect(page.getByTestId("cadet-history")).toContainText("Rewrite required");

  // 12. Statistics render from real data.
  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: "Statement status" })).toBeVisible();
  await expect(page.getByText(/Rewrite required: \d+/)).toBeVisible();

  // 13. Data persists across sign-out / sign-in.
  await page.goto("/more");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/statements");
  await expect(page).toHaveURL(/\/login/);
  await signIn(page);
  expect(await count(page, "count-statements")).toBe(before.statements + 3);

  // 14. Switching the active batch does not mix records.
  await page.goto("/batches");
  await page.getByRole("link", { name: /13\/26 MDST/ }).click();
  await page.getByTestId("activate-batch").click();
  await page.getByLabel(/Type "13\/26 MDST" to confirm/).fill("13/26 MDST");
  await page.getByTestId("confirm-activate").click();
  await expect(page.getByTestId("active-batch-name")).toHaveText("13/26 MDST");
  expect(await count(page, "count-statements")).toBe(0);
  expect(await count(page, "count-cadets")).toBe(10);
  // Switch back.
  await page.goto("/batches");
  await page.getByRole("link", { name: /14\/26 MDST/ }).click();
  await page.getByTestId("activate-batch").click();
  await page.getByLabel(/Type "14\/26 MDST" to confirm/).fill("14/26 MDST");
  await page.getByTestId("confirm-activate").click();
  await expect(page.getByTestId("active-batch-name")).toHaveText("14/26 MDST");
  expect(await count(page, "count-statements")).toBe(before.statements + 3);

  // 15. Audit history records the important changes.
  await page.goto("/activity");
  await expect(page.getByText(/Accepted statement \(version 1\) from/).first()).toBeVisible();
  await expect(page.getByText(/Rewrite requested for/).first()).toBeVisible();
  await expect(page.getByText(/Set 14\/26 MDST as the active batch/).first()).toBeVisible();
});

test("bulk NOR creation and a safe correction", async ({ page }) => {
  await signIn(page);
  const norBefore = await count(page, "count-nor");
  await page.goto("/records/new?type=NOR");
  await page.getByRole("button", { name: "Select cadets" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input[type=checkbox]").nth(1).check();
  await dialog.locator("input[type=checkbox]").nth(2).check();
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.getByLabel("Category").selectOption({ label: "Turnout" });
  await page.getByLabel("Observation").fill("E2E: boots not polished at inspection.");
  await page.getByTestId("review-entries").click();
  await page.getByTestId("confirm-create").click();
  await expect(page.getByTestId("entry-success")).toContainText("2 NORs created");
  expect(await count(page, "count-nor")).toBe(norBefore + 2);

  // Correct one record; the other is unaffected and the old value is kept in history.
  await page.goto("/records?q=E2E%3A%20boots");
  await page.getByRole("link", { name: /boots not polished/ }).first().click();
  await page.getByRole("button", { name: "Correct" }).click();
  await page.getByRole("dialog").getByLabel("Description").fill("E2E: boots and belt not polished at inspection.");
  await page.getByRole("dialog").getByLabel("Reason for correction").fill("Added detail");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText("E2E: boots and belt not polished at inspection.").first()).toBeVisible();
  await page.getByText("Show previous values").click();
  await expect(page.getByText("E2E: boots not polished at inspection.").first()).toBeVisible();
  await page.goto("/records?q=E2E%3A%20boots");
  await expect(page.getByRole("link", { name: /E2E: boots not polished/ })).toHaveCount(1);
});

test("protected API rejects unauthenticated requests", async ({ request }) => {
  const res = await request.post("/api/export", { form: { batchId: "x", dataset: "records" }, headers: { origin: "http://localhost:3200" } });
  expect(res.status()).toBe(401);
});

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
  await page.getByTestId("create-statement-for-selected").click();
  await expect(page.getByTestId("selected-cadets").locator("li")).toHaveCount(3);
  await page.getByLabel("Subject").fill("E2E: movements on Tuesday evening");
  await page.getByRole("button", { name: "+2 days" }).click();
  await page.getByTestId("review-entries").click();
  await expect(page.getByTestId("review-summary")).toContainText("3 individual statement requests will be created");
  await expect(page.getByTestId("review-summary")).toContainText("Deadline:");
  await page.getByTestId("confirm-create").click();
  const success = page.getByTestId("entry-success");
  await expect(success).toContainText("3 statement requests created");

  // 6. Each cadet has a separate workflow.
  const links = success.getByRole("link", { name: /View/ });
  const hrefs = await Promise.all([0, 1, 2].map((i) => links.nth(i).getAttribute("href")));
  expect(new Set(hrefs).size).toBe(3);

  // 7. Mark one Pending review.
  await page.goto(hrefs[0]!);
  await expect(page.getByText(/Deadline .*due in/)).toBeVisible();
  await page.getByTestId("record-receipt").click();
  await expect(page.getByText("Pending review").first()).toBeVisible();

  // 8. Request a rewrite for another.
  await page.goto(hrefs[1]!);
  await page.getByTestId("record-receipt").click();
  await page.getByTestId("request-rewrite").click();
  await page.getByRole("button", { name: "+1 week" }).click();
  await page.getByLabel("Feedback").fill("No timings given");
  await page.getByTestId("confirm-rewrite").click();
  await expect(page.getByText("Waiting for rewrite")).toBeVisible();
  await expect(page.getByText(/New deadline/)).toBeVisible();

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
  await expect(page.getByTestId("cadet-history")).toContainText("E2E: movements on Tuesday evening");
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
  await page.goto((await page.getByRole("link", { name: /13\/26 MDST/ }).getAttribute("href"))!);
  await page.getByTestId("activate-batch").click();
  await page.getByLabel(/Type "13\/26 MDST" to confirm/).fill("13/26 MDST");
  await page.getByTestId("confirm-activate").click();
  await expect(page.getByTestId("active-batch-name")).toHaveText("13/26 MDST");
  expect(await count(page, "count-statements")).toBe(0);
  expect(await count(page, "count-cadets")).toBe(10);
  // Switch back.
  await page.goto("/batches");
  await page.goto((await page.getByRole("link", { name: /14\/26 MDST/ }).getAttribute("href"))!);
  await page.getByTestId("activate-batch").click();
  await page.getByLabel(/Type "14\/26 MDST" to confirm/).fill("14/26 MDST");
  await page.getByTestId("confirm-activate").click();
  await expect(page.getByTestId("active-batch-name")).toHaveText("14/26 MDST");
  expect(await count(page, "count-statements")).toBe(before.statements + 3);

  // 15. Audit history records the important changes.
  await page.goto("/activity");
  await expect(page.getByText(/Accepted .*'s statement \(submission 1\)/).first()).toBeVisible();
  await expect(page.getByText(/Rewrite required from .* by /).first()).toBeVisible();
  await expect(page.getByText(/Set 14\/26 MDST as the active batch/).first()).toBeVisible();
});

test("bulk NOR creation and a safe correction", async ({ page }) => {
  await signIn(page);
  const norBefore = await count(page, "count-nor");
  await page.goto("/records/new?type=NOR");
  // Type-ahead picker: type part of a name, pick from the filtered dropdown.
  const box = page.getByRole("combobox", { name: /cadet's name/ });
  await box.fill("lee");
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  const firstName = (await options.first().innerText()).split("\n")[0]!.trim();
  await options.first().click();
  await expect(box).toHaveValue("");
  await box.fill("tan");
  await box.press("Enter"); // Enter picks the highlighted (first) match, never "add all"
  await expect(page.getByTestId("selected-cadets").locator("li")).toHaveCount(2);
  await expect(page.getByTestId("selected-cadets")).toContainText(firstName);
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

test("home leads with outstanding statements and flagged cadets, with explanations", async ({ page }) => {
  await signIn(page);
  await expect(page.getByTestId("today-summary")).toContainText(/overdue|due|review|outstanding/);
  const sections = await page.locator("main h2").allInnerTexts();
  const idx = (t: string) => sections.findIndex((s) => s.toUpperCase().startsWith(t));
  expect(idx("OUTSTANDING STATEMENTS")).toBeGreaterThanOrEqual(0);
  expect(idx("OUTSTANDING STATEMENTS")).toBeLessThan(idx("CADETS FLAGGED"));
  expect(idx("CADETS FLAGGED")).toBeLessThan(idx("WHAT THE DATA SAYS"));
  await expect(page.getByTestId("outstanding-list").locator("li").first()).toContainText(/Overdue/);
  await expect(page.getByTestId("flagged-list")).toContainText(/separate occurrences|statements requested|repeated/);
  await expect(page.getByTestId("insights")).toContainText("Why it matters");
});

test("statement queue quick actions and overdue tab", async ({ page }) => {
  await signIn(page);
  await page.goto("/statements?status=OVERDUE");
  const rows = page.getByTestId("statement-queue").locator(":scope > li");
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);
  await expect(rows.first()).toContainText("Overdue");
  await rows.first().getByTestId("quick-receive").click();
  await expect(rows).toHaveCount(before - 1);
});

test("returning from a cadet profile keeps the roster search", async ({ page }) => {
  await signIn(page);
  await page.goto("/cadets");
  await page.getByLabel("Search cadets").fill("Byte 2");
  await expect(page).toHaveURL(/q=Byte/);
  await page.locator("ul.md\\:hidden a").first().click();
  await expect(page.getByTestId("cadet-name")).toBeVisible();
  await page.getByRole("link", { name: "Roster" }).click();
  await expect(page).toHaveURL(/q=Byte/);
  await expect(page.getByLabel("Search cadets")).toHaveValue("Byte 2");
});

test("search palette: type a name, start a NOR for that cadet, create in one tap, then follow up with a statement", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("open-search").click();
  await page.getByTestId("palette-input").fill("alex");
  await page.getByRole("button", { name: /New NOR for Alex Tan/ }).click();
  await expect(page).toHaveURL(/type=NOR/);
  await expect(page.getByTestId("selected-cadets")).toContainText("Alex Tan");

  // Recently used description fills in with one tap.
  await page.getByTestId("quick-picks").getByRole("button").first().click();
  await expect(page.getByLabel("Observation")).not.toHaveValue("");
  // Single cadet: no confirm dialog.
  await page.getByTestId("review-entries").click();
  await expect(page.getByTestId("entry-success")).toContainText("1 NOR created");

  // Follow-up: request a statement from the same cadet, subject prefilled.
  await page.getByTestId("followup-statements").click();
  await expect(page.getByTestId("selected-cadets")).toContainText("Alex Tan");
  await expect(page.getByLabel("Subject")).not.toHaveValue("");
  await page.getByTestId("review-entries").click();
  await expect(page.getByTestId("entry-success")).toContainText("1 statement request created");

  // Palette also navigates to pages by name.
  await page.keyboard.press("Escape");
  await page.getByTestId("open-search").click();
  await page.getByTestId("palette-input").fill("stats");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/stats/);
});

test("statements can be actioned straight from Home and the cadet profile", async ({ page }) => {
  await signIn(page);
  const list = page.getByTestId("outstanding-list");
  const accept = list.getByTestId("quick-accept").first();
  await expect(accept).toBeVisible();
  const pendingBefore = await list.getByTestId("quick-accept").count();
  await accept.click();
  await expect(list.getByTestId("quick-accept")).toHaveCount(pendingBefore - 1);

  // Cadet profile shows open statements with their next action.
  await list.locator("a[href^='/cadets/']").first().click();
  await expect(page.getByRole("heading", { name: /Open statements/ })).toBeVisible();
  await expect(page.getByTestId("quick-receive").or(page.getByTestId("quick-accept")).first()).toBeVisible();
});

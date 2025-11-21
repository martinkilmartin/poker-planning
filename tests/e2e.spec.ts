import { test, expect } from '@playwright/test';

test.describe('Poker Planning E2E', () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await page.screenshot({
        path: `playwright-report/screenshots/failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
      });
    }
  });

  test('Basic Game Flow', async ({ browser }) => {
    // --- Host Setup ---
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    hostPage.on('console', msg => console.log('HOST CONSOLE:', msg.text()));
    await hostPage.goto('/');
    await hostPage.screenshot({ path: 'playwright-report/screenshots/debug-load.png' });

    // Create Room
    await hostPage.getByLabel('Your Name').fill('Host Alice');
    // Ensure we use local server for stable tests
    const useLocalCheckbox = hostPage.getByLabel('Use Local Server (Dev)');
    if (await useLocalCheckbox.isVisible()) {
      await useLocalCheckbox.check();
    }
    const createBtn = hostPage.getByRole('button', { name: 'Create New Room' }); // Exact name match
    await expect(createBtn).toBeVisible();
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    // Wait for room to be created and get URL
    await expect(hostPage.getByText('Waiting for votes')).toBeVisible();
    const roomUrl = hostPage.url();
    expect(roomUrl).toContain('?room=');

    // --- Guest Setup ---
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(roomUrl);

    // Join Room
    await guestPage.getByLabel('Your Name').fill('Guest Bob');
    if (await guestPage.getByLabel('Use Local Server (Dev)').isVisible()) {
      await guestPage.getByLabel('Use Local Server (Dev)').check();
    }
    await guestPage.getByRole('button', { name: 'Join Room' }).click();

    // --- Verification ---
    // Verify players see each other
    // Verify players see each other
    await expect(hostPage.locator('.player-name', { hasText: 'Guest Bob' })).toBeVisible();
    await expect(guestPage.locator('.player-name', { hasText: 'Host Alice' })).toBeVisible();

    // --- Voting ---
    // Host votes 5
    await hostPage.getByRole('button', { name: '5', exact: true }).click();
    await expect(hostPage.getByText('Thinking')).not.toBeVisible(); // Should show checkmark or similar

    // Guest votes 8
    await guestPage.getByRole('button', { name: '8', exact: true }).click();

    // --- Reveal ---
    await hostPage.getByRole('button', { name: 'Reveal', exact: true }).click();

    // Verify results
    await expect(
      hostPage.locator('.player-seat', { hasText: 'Host Alice' }).getByText('5', { exact: true })
    ).toBeVisible();
    await expect(
      hostPage.locator('.player-seat', { hasText: 'Guest Bob' }).getByText('8', { exact: true })
    ).toBeVisible();
    await expect(
      guestPage.locator('.player-seat', { hasText: 'Host Alice' }).getByText('5', { exact: true })
    ).toBeVisible();
    await expect(
      guestPage.locator('.player-seat', { hasText: 'Guest Bob' }).getByText('8', { exact: true })
    ).toBeVisible();

    // --- Reset ---
    await hostPage.getByRole('button', { name: 'Reset Votes' }).click();
    await expect(hostPage.getByText('Waiting for votes')).toBeVisible();
    await expect(guestPage.getByText('Waiting for votes')).toBeVisible();
  });

  test('Host Transfer', async ({ browser }) => {
    // --- Setup ---
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await hostPage.goto('/');
    await hostPage.getByLabel('Your Name').fill('Host Alice');
    await hostPage.getByLabel('Use Local Server (Dev)').check();
    await hostPage.getByRole('button', { name: 'Create New Room' }).click();
    await expect(hostPage.getByText('Waiting for votes')).toBeVisible();
    const roomUrl = hostPage.url();

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(roomUrl);
    await guestPage.getByLabel('Your Name').fill('Guest Bob');
    await guestPage.getByLabel('Use Local Server (Dev)').check();
    await guestPage.getByRole('button', { name: 'Join Room' }).click();

    await expect(hostPage.locator('.player-name', { hasText: 'Guest Bob' })).toBeVisible();

    // --- Transfer Host ---
    // Host clicks the crown icon on Guest's card
    // Note: We need to target the specific player card.
    // Assuming the crown button has a specific aria-label or class.
    // Let's try to find the button within the guest's player card.
    const guestCard = hostPage.locator('.player-seat', { hasText: 'Guest Bob' });
    // Button has title "Make Host" but content is emoji. Use getByTitle.
    await guestCard.getByTitle('Make Host').click();
    await hostPage.getByRole('button', { name: 'Confirm' }).click();

    // --- Verification ---
    // Guest should now see host controls
    await expect(guestPage.getByRole('button', { name: 'Reveal', exact: true })).toBeVisible();

    // Original Host should NOT see host controls
    await expect(hostPage.getByRole('button', { name: 'Reveal', exact: true })).not.toBeVisible();

    // Guest (new host) reveals
    await guestPage.getByRole('button', { name: 'Reveal', exact: true }).click();
    await expect(hostPage.getByText('Revealed')).toBeVisible(); // Or check for revealed state
  });

  test('Persistence & Rejoin', async ({ browser }) => {
    // --- Setup ---
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await hostPage.goto('/');
    await hostPage.getByLabel('Your Name').fill('Host Alice');
    await hostPage.getByLabel('Use Local Server (Dev)').check();
    await hostPage.getByRole('button', { name: 'Create New Room' }).click();
    await expect(hostPage.getByText('Waiting for votes')).toBeVisible();

    // Host votes
    await hostPage.getByRole('button', { name: '5', exact: true }).click();

    // --- Refresh Host ---
    await hostPage.reload();

    // Verify Host rejoins correctly
    await expect(hostPage.locator('.player-name', { hasText: 'Host Alice' })).toBeVisible();
    // Verify vote persisted (or at least state is consistent)
    // Note: Votes might be cleared on rejoin depending on implementation,
    // but checking if we are still host is crucial.
    await expect(hostPage.getByRole('button', { name: 'Reveal', exact: true })).toBeVisible();

    // Verify we are still the "Server" (Room Owner)
    // We can check if we can still control the game.
    await hostPage.getByRole('button', { name: 'Reveal', exact: true }).click();
    // If we were not the server/host, this might fail or do nothing.
  });

  test('Auto-Reveal', async ({ browser }) => {
    // --- Setup ---
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await hostPage.goto('/');
    await hostPage.getByLabel('Your Name').fill('Host Alice');
    await hostPage.getByLabel('Use Local Server (Dev)').check();
    await hostPage.getByRole('button', { name: 'Create New Room' }).click();
    await expect(hostPage.getByText('Waiting for votes')).toBeVisible();
    const roomUrl = hostPage.url();

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(roomUrl);
    await guestPage.getByLabel('Your Name').fill('Guest Bob');
    await guestPage.getByLabel('Use Local Server (Dev)').check();
    await guestPage.getByRole('button', { name: 'Join Room' }).click();

    // --- Enable Auto-Reveal ---
    // Open settings (if hidden) or just interact with controls
    // Open settings panel first
    await hostPage.getByTitle('Settings').click();

    // Assuming settings are visible or accessible
    const autoRevealCheckbox = hostPage.getByLabel('Auto-reveal when one person left');
    if (!(await autoRevealCheckbox.isChecked())) {
      await autoRevealCheckbox.check();
    }

    // Set short duration
    await hostPage.getByLabel('Timer Duration (seconds):').fill('2');

    // --- Voting ---
    await hostPage.getByRole('button', { name: '5', exact: true }).click();
    await guestPage.getByRole('button', { name: '8', exact: true }).click();

    // --- Verify Auto-Reveal ---
    // Should reveal after ~2 seconds
    await expect(hostPage.getByText('5', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(guestPage.getByText('8', { exact: true })).toBeVisible({ timeout: 5000 });
  });
  test('Multiple Players & Vote Changing', async ({ browser }) => {
    // --- Setup ---
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await hostPage.goto('/');
    await hostPage.getByLabel('Your Name').fill('Host Alice');
    await hostPage.getByLabel('Use Local Server (Dev)').check();
    await hostPage.getByRole('button', { name: 'Create New Room' }).click();
    await expect(hostPage.getByText('Waiting for votes')).toBeVisible();
    const roomUrl = hostPage.url();

    const guest1Context = await browser.newContext();
    const guest1Page = await guest1Context.newPage();
    await guest1Page.goto(roomUrl);
    await guest1Page.getByLabel('Your Name').fill('Guest Bob');
    await guest1Page.getByLabel('Use Local Server (Dev)').check();
    await guest1Page.getByRole('button', { name: 'Join Room' }).click();

    const guest2Context = await browser.newContext();
    const guest2Page = await guest2Context.newPage();
    await guest2Page.goto(roomUrl);
    await guest2Page.getByLabel('Your Name').fill('Guest Charlie');
    await guest2Page.getByLabel('Use Local Server (Dev)').check();
    await guest2Page.getByRole('button', { name: 'Join Room' }).click();

    // Verify all players present
    await expect(hostPage.locator('.player-name', { hasText: 'Guest Bob' })).toBeVisible();
    await expect(hostPage.locator('.player-name', { hasText: 'Guest Charlie' })).toBeVisible();

    // --- Voting & Changing Vote ---
    // Guest 1 votes 3
    await guest1Page.getByRole('button', { name: '3', exact: true }).click();
    // Guest 1 changes vote to 5
    await guest1Page.getByRole('button', { name: '5', exact: true }).click();

    // Guest 2 votes 8
    await guest2Page.getByRole('button', { name: '8', exact: true }).click();

    // Host votes 5
    await hostPage.getByRole('button', { name: '5', exact: true }).click();

    // --- Reveal ---
    await hostPage.getByRole('button', { name: 'Reveal', exact: true }).click();

    // --- Verification ---
    // Check Guest 1's final vote is 5 (not 3)
    await expect(
      hostPage.locator('.player-seat', { hasText: 'Guest Bob' }).getByText('5', { exact: true })
    ).toBeVisible();
    // Check Guest 2 is 8
    await expect(
      hostPage.locator('.player-seat', { hasText: 'Guest Charlie' }).getByText('8', { exact: true })
    ).toBeVisible();
    // Check Host is 5
    await expect(
      hostPage.locator('.player-seat', { hasText: 'Host Alice' }).getByText('5', { exact: true })
    ).toBeVisible();
  });

  test('Settings Sync', async ({ browser }) => {
    // --- Setup ---
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await hostPage.goto('/');
    await hostPage.getByLabel('Your Name').fill('Host Alice');
    await hostPage.getByLabel('Use Local Server (Dev)').check();
    await hostPage.getByRole('button', { name: 'Create New Room' }).click();
    await expect(hostPage.getByText('Waiting for votes')).toBeVisible();
    const roomUrl = hostPage.url();

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(roomUrl);
    await guestPage.getByLabel('Your Name').fill('Guest Bob');
    await guestPage.getByLabel('Use Local Server (Dev)').check();
    await guestPage.getByRole('button', { name: 'Join Room' }).click();

    // --- Change Settings ---
    await hostPage.getByTitle('Settings').click();
    // Change duration to 5 seconds
    await hostPage.getByLabel('Timer Duration (seconds):').fill('5');
    // Toggle auto-reveal off then on to trigger update if needed, or just fill
    // Assuming the input event triggers updateSettings
    // We might need to blur the input or hit enter if it's lazy
    await hostPage.getByLabel('Timer Duration (seconds):').blur();

    // --- Verify Sync ---
    // Guest should receive update. We can verify by checking if Guest's UI reflects it (if visible)
    // Or we can check the state indirectly.
    // Let's assume the settings modal is available to guest but read-only?
    // Or simpler: Host disables auto-reveal.
    const autoRevealCheckbox = hostPage.getByLabel('Auto-reveal when one person left');
    if (await autoRevealCheckbox.isChecked()) {
      await autoRevealCheckbox.uncheck();
    }

    // Now verify auto-reveal does NOT happen
    await hostPage.getByRole('button', { name: '5', exact: true }).click();
    await guestPage.getByRole('button', { name: '8', exact: true }).click();

    // Wait a bit to ensure it DOESN'T reveal (default was 10s, we set 5s, but disabled it)
    // If it was enabled, it would reveal.
    // Let's wait 3 seconds. If it reveals, test fails.
    await hostPage.waitForTimeout(3000);
    await expect(hostPage.getByText('Revealed')).not.toBeVisible();

    // Now Enable it again
    await autoRevealCheckbox.check();
    // It should trigger checkCountdownTrigger immediately if everyone voted?
    // Or maybe we need to change a vote to re-trigger?
    // The logic in useGame: checkCountdownTrigger is called on VOTE.
    // If we just change settings, we might need to re-trigger.
    // But `updateSettings` calls `broadcastState`.
    // The `setInterval` on Server checks `state.autoReveal`.
    // So if we enable it, and everyone voted, does it reveal immediately?
    // Let's have Guest change vote to trigger it.
    await guestPage.getByRole('button', { name: '13', exact: true }).click();

    await expect(hostPage.getByText('5', { exact: true })).toBeVisible({ timeout: 7000 });
  });
});

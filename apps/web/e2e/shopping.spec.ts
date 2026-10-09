import { expect, test, type Page } from '@playwright/test';

const stamp = Date.now();
const shopper = {
  name: 'Playwright Shopper',
  email: `pw_${stamp}@example.com`,
  password: 'Shopper123',
};

async function signUp(page: Page) {
  await page.goto('/register', { waitUntil: 'networkidle' });
  await page.getByLabel('Full name').fill(shopper.name);
  await page.getByLabel('Email').fill(shopper.email);
  await page.getByLabel('Password', { exact: true }).fill(shopper.password);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).not.toHaveURL(/\/register/);
}

async function logIn(page: Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function addFirstResultToCart(page: Page, query: string) {
  await page.goto('/');
  const search = page.getByLabel('Search products').first();
  await search.fill(query);
  await search.press('Enter');
  await expect(page).toHaveURL(/\/search\?.*q=/);
  const firstProduct = page.locator('main a[href^="/products/"]').first();
  await expect(firstProduct).toBeVisible();
  // Cards animate on hover/entry, so navigate by href instead of waiting for the link to be "stable".
  await page.goto((await firstProduct.getAttribute('href')) as string, {
    waitUntil: 'networkidle',
  });
  await expect(page).toHaveURL(/\/products\//);
  await page
    .getByRole('button', { name: /add to cart/i })
    .first()
    .click();
  await expect(page.getByText(/added to cart/i).first()).toBeVisible();
}

async function fillAddress(page: Page) {
  await page.getByRole('button', { name: /add a new address/i }).click();
  await page.getByLabel('Full name').fill(shopper.name);
  await page.getByLabel('Mobile number').fill('9876501234');
  await page.getByLabel('PIN code').fill('560038');
  await page.getByLabel('City').fill('Bengaluru');
  await page.getByLabel('State').selectOption('Karnataka');
  await page.getByLabel('House no., building, street').fill('12, 4th Cross, Indiranagar');
  await page.getByRole('button', { name: /save address/i }).click();
}

test.describe.serial('Customer journey', () => {
  test('home page renders hero, categories and product rails', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Glideinbir Kart/i);
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await expect(page.locator('main a[href^="/products/"]').first()).toBeVisible();
  });

  test('guests are sent to log in before checkout', async ({ page }) => {
    await page.goto('/checkout');
    await expect(page).toHaveURL(/\/login/);
  });

  test('sign up, search, add to cart and place a Cash on Delivery order', async ({ page }) => {
    await signUp(page);
    await addFirstResultToCart(page, 'headphones');

    await page.goto('/cart');
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await page.getByRole('button', { name: /proceed to checkout/i }).click();
    await expect(page).toHaveURL(/\/checkout/);

    await fillAddress(page);
    const pub = await page.request.get('/api/v1/settings/public');
    if ((await pub.json()).data.onlinePaymentsEnabled === false) {
      // cash-only store: the online card is not offered at all
      await expect(page.getByText('Pay online')).toHaveCount(0);
    }
    await page.getByText('Cash on Delivery').click();
    await page.getByTestId('place-order').click();

    await expect(page).toHaveURL(/\/order-confirmation\//);
    await expect(page.getByTestId('confirmation-heading')).toContainText(/order is placed/i);
    await expect(page.getByTestId('order-number')).toBeVisible();
  });

  test('pay online through the test gateway', async ({ page, request }) => {
    const settings = await request.get('/api/v1/settings/public');
    test.skip(
      (await settings.json()).data.onlinePaymentsEnabled === false,
      'Online payment is switched off (cash-only store)',
    );
    await logIn(page, shopper.email, shopper.password);

    await addFirstResultToCart(page, 'speaker');
    await page.goto('/checkout');
    await page.getByTestId('place-order').click();
    await page.getByTestId('mock-pay-success').click();

    await expect(page).toHaveURL(/\/order-confirmation\//);
    await expect(page.getByTestId('confirmation-heading')).toContainText(/order is placed/i);
  });

  test('the order appears in My Orders', async ({ page }) => {
    await logIn(page, shopper.email, shopper.password);
    await page.goto('/account/orders');
    await expect(page.getByTestId('order-row').first()).toBeVisible();
  });
});

test.describe('Access control', () => {
  test('customers cannot open the admin console', async ({ page }) => {
    await logIn(page, 'customer@glideinbirkart.in', 'Customer@123');
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin$/);
  });

  test('admin sees the dashboard', async ({ page }) => {
    await logIn(page, 'admin@glideinbirkart.in', 'Admin@12345');
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /dashboard/i }).first()).toBeVisible();
  });
});

test('@mobile product listing is usable at phone width', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator('main a[href^="/products/"]').first()).toBeVisible();
});

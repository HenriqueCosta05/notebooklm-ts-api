import { chromium, type BrowserContext, type Cookie } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { loadAuthJson, loadStorageState } from '../infrastructure/auth/storage-loader';

interface StorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{
      name: string;
      value: string;
    }>;
  }>;
}

interface ExtractedAuth {
  timestamp: string;
  cookies: {
    [key: string]: string;
  };
  localStorage: {
    [key: string]: string;
  };
  storageState?: StorageState;
}

const IMPORTANT_COOKIE_NAMES = [
  '__Secure-1PSID',
  '__Secure-3PSID',
  'NID',
  'HSID',
  'SSID',
  'SID',
  'APISID',
  'SAPISID',
  'LSID',
];

const SESSION_COOKIE_NAMES = ['SID', '__Secure-1PSID', '__Secure-3PSID'];

const toCookieMap = (cookies: Cookie[]): Record<string, string> => {
  const cookieMap: Record<string, string> = {};
  cookies.forEach((cookie) => {
    cookieMap[cookie.name] = cookie.value;
  });
  return cookieMap;
};

const hasSessionCookie = (cookies: Record<string, string>): boolean =>
  SESSION_COOKIE_NAMES.some((cookieName) => Boolean(cookies[cookieName]));

const toStorageStateCookies = (
  cookies: Cookie[],
): StorageState['cookies'] =>
  cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  }));

const readSavedAuth = (): StorageState | null => {
  const authJsonPath = path.join(process.cwd(), '.notebooklm-auth', 'auth.json');
  const storageStatePath = path.join(process.cwd(), '.notebooklm-auth', 'storage_state.json');

  if (fs.existsSync(authJsonPath)) {
    const savedAuth = loadAuthJson(authJsonPath);
    if (savedAuth.storageState) {
      return savedAuth.storageState;
    }
  }

  if (fs.existsSync(storageStatePath)) {
    return loadStorageState(storageStatePath);
  }

  return null;
};

type PlaywrightStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

async function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function extractAuthFromBrowser(): Promise<void> {
  console.log('🚀 NotebookLM Auth Token Extractor');
  console.log('==================================\n');

  console.log('This tool will open NotebookLM in a browser.');
  console.log('You will need to log in manually.\n');

  const outputDir = path.join(process.cwd(), '.notebooklm-auth');
  const outputPath = path.join(outputDir, 'storage_state.json');
  const authJsonPath = path.join(outputDir, 'auth.json');

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const savedStorageState = readSavedAuth();
  if (savedStorageState) {
    const savedCookies = savedStorageState.cookies as Cookie[];
    const savedCookiesMap = toCookieMap(savedCookies);

    if (hasSessionCookie(savedCookiesMap)) {
      const extractedLocalStorage = savedStorageState.origins?.reduce<Record<string, string>>(
        (accumulator, origin) => {
          if (typeof origin === 'object' && origin && 'localStorage' in origin) {
            (origin as { localStorage: Array<{ name: string; value: string }> }).localStorage.forEach((item) => {
              accumulator[item.name] = item.value;
            });
          }
          return accumulator;
        },
        {},
      ) ?? {};

      const extractedAuth: ExtractedAuth = {
        timestamp: new Date().toISOString(),
        cookies: savedCookiesMap,
        localStorage: extractedLocalStorage,
        storageState: {
          cookies: toStorageStateCookies(savedCookies),
          origins: savedStorageState.origins ?? [],
        },
      };

      fs.writeFileSync(outputPath, JSON.stringify(extractedAuth.storageState, null, 2));
      fs.writeFileSync(authJsonPath, JSON.stringify(extractedAuth, null, 2));

      console.log('✅ Valid saved auth found. Reusing it without opening a browser.');
      console.log(`📁 Refreshed files: ${outputPath}, ${authJsonPath}`);
      return;
    }

    console.log('⚠️  Saved auth exists but has no usable session cookie. Opening browser to refresh it.');
  }

  let browser;
  let context;
  let page;

  try {
    // Launch browser with stealth mode
    console.log('📱 Launching browser...');
    browser = await chromium.launch({
      headless: false, // Show browser window for user interaction
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });

    // Create context with realistic browser settings
    context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });

    // Hide automation indicators
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });

    // Create page
    page = await context.newPage();

    // Navigate to NotebookLM with extra headers
    console.log('🌐 Navigating to NotebookLM...');
    
    try {
      await page.goto('https://notebooklm.google.com', {
        waitUntil: 'domcontentloaded',
        timeout: 90000,
      });
    } catch (navError) {
      console.log('⚠️  Navigation warning (may be expected):', 
        navError instanceof Error ? navError.message : String(navError));
    }

    // Wait a bit for the page to stabilize
    await page.waitForTimeout(2000);

    console.log('\n✅ Browser opened with NotebookLM');
    console.log('📝 Please log in to your Google account.');
    console.log('   If you see "This browser or app may not be secure":\n');
    console.log('   1. Click "Try again"');
    console.log('   2. Complete any security challenges (2FA, etc.)');
    console.log('   3. Once you see your notebooks, the auth will be extracted.\n');

    console.log('⏳ Waiting for NotebookLM to finish sign-in (timeout: 5 minutes)...');

    await page.waitForURL('https://notebooklm.google.com*', {
      timeout: 5 * 60 * 1000,
    });

    console.log('\n✅ Authentication detected! Extracting credentials...\n');

    const storageState = await context.storageState();
    const cookies = storageState.cookies as Cookie[];
    const cookiesMap = toCookieMap(cookies);

    if (!hasSessionCookie(cookiesMap)) {
      throw new Error(
        'NotebookLM opened, but no session cookie was present in the saved browser state. ' +
          'Complete the Google sign-in flow and try again.',
      );
    }

    const extractedLocalStorage = storageState.origins.reduce<Record<string, string>>(
      (accumulator, origin) => {
        origin.localStorage.forEach((item) => {
          accumulator[item.name] = item.value;
        });
        return accumulator;
      },
      {},
    );

    // Save storage state (Playwright format)
    const normalizedStorageState: StorageState = {
      cookies: storageState.cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
      })),
      origins: [
        {
          origin: 'https://notebooklm.google.com',
          localStorage: Object.entries(extractedLocalStorage).map(([name, value]) => ({
            name,
            value: String(value),
          })),
        },
      ],
    };

    const extractedAuth: ExtractedAuth = {
      timestamp: new Date().toISOString(),
      cookies: cookiesMap,
      localStorage: extractedLocalStorage,
      storageState: normalizedStorageState,
    };

    // Save to files
    fs.writeFileSync(outputPath, JSON.stringify(normalizedStorageState, null, 2));
    fs.writeFileSync(authJsonPath, JSON.stringify(extractedAuth, null, 2));

    console.log('📁 Auth files saved:');
    console.log(`   ✅ ${outputPath}`);
    console.log(`   ✅ ${authJsonPath}\n`);

    // Display important cookies
    console.log('🔑 Important Cookies Found:');
    console.log('==========================\n');

    const importantCookies = [
      '__Secure-1PSID',
      '__Secure-3PSID',
      'NID',
      'HSID',
      'SSID',
      'SameSite',
    ];

    let foundImportant = false;
    importantCookies.forEach((cookieName) => {
      if (cookiesMap[cookieName]) {
        console.log(`${cookieName}:`);
        console.log(`  Value: ${cookiesMap[cookieName].substring(0, 50)}...`);
        console.log(`  (Full value saved in ${authJsonPath})\n`);
        foundImportant = true;
      }
    });

    if (!foundImportant) {
      console.log('⚠️  No standard Google auth cookies found.');
      console.log('   All cookies have been saved anyway.\n');
    }

    // Print usage instructions
    console.log('\n📖 Next Steps:');
    console.log('================\n');

    console.log('Option 1: Use Playwright Storage State (Recommended)');
    console.log('  Set this environment variable:');
    console.log(
      `  export NOTEBOOKLM_STORAGE_PATH="${path.resolve(outputPath)}"\n`,
    );

    console.log('Option 2: Use Environment Variable (requires manual setup)');
    console.log('  Set the JSON directly:');
    console.log(`  export NOTEBOOKLM_AUTH_JSON='${JSON.stringify(extractedAuth)}'`);
    console.log(
      '  (Note: This is less secure, use Option 1 if possible)\n',
    );

    console.log('Option 3: Copy to .env file');
    console.log('  Add to your .env file:');
    console.log(`  NOTEBOOKLM_STORAGE_PATH=${path.resolve(outputPath)}\n`);

    console.log('✅ Setup complete! You can now use the API with your credentials.\n');
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ Error:', error.message);

      if (
        error.message.includes(
          'This browser or app may not be secure',
        )
      ) {
        console.error(
          '\n🔒 Google security challenge detected.\n',
        );
        console.error('This is a known issue with automated browsers.');
        console.error('Try these solutions:\n');
        console.error('Solution 1: Retry with a slight delay');
        console.error('  npm run auth:extract\n');
        console.error('Solution 2: Clear browser cache and try again');
        console.error('  rm -rf ~/.cache/ms-playwright/');
        console.error('  npx playwright install chromium');
        console.error('  npm run auth:extract\n');
        console.error('Solution 3: Use manual Playwright codegen');
        console.error('  npx playwright codegen --save-storage=storage_state.json https://notebooklm.google.com\n');
        console.error(
          'Solution 4: Try with a system-installed Chrome/Chromium',
        );
        console.error('  Install Chrome and use it directly\n');
      } else if (error.message.includes('Still on Google login')) {
        console.error(
          '\n🔐 Google sign-in failed or timed out.\n',
        );
        console.error(
          'You may need to:',
        );
        console.error('  1. Complete security verification (2FA, etc.)');
        console.error('  2. Check your internet connection');
        console.error('  3. Try a different browser (Safari, Firefox)');
        console.error('  4. Disable VPN/Proxy temporarily\n');
      } else if (error.message.includes('Timeout')) {
        console.error(
          '\n⏱️  Login timeout (5 minutes)\n',
        );
        console.error('   Please try again and log in faster.');
        console.error('   Or run: npx playwright codegen --save-storage=storage_state.json https://notebooklm.google.com\n');
      }
    }
  } finally {
    // Clean up
    if (context) {
      await context.close();
    }
    if (browser) {
      await browser.close();
    }
  }
}

// Run the extractor
extractAuthFromBrowser().catch(console.error);

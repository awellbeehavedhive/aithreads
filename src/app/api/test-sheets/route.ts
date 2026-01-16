import { NextResponse } from 'next/server';
import { google } from 'googleapis';

/**
 * Test endpoint to verify Google Sheets configuration
 */
export async function GET() {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_ARTICLE_LOG_ID;
    const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    const diagnostics: Record<string, any> = {
      hasSpreadsheetId: !!spreadsheetId,
      hasCredentials: !!credentials,
      spreadsheetId: spreadsheetId, // Show full ID for debugging
      credentialsLength: credentials ? credentials.length : 0,
    };

    if (!credentials || !spreadsheetId) {
      return NextResponse.json({
        success: false,
        error: 'Missing configuration',
        diagnostics,
      }, { status: 500 });
    }

    // Try to parse credentials
    let parsedCredentials;
    try {
      parsedCredentials = JSON.parse(credentials);
      diagnostics.credentialsValid = true;
      diagnostics.serviceAccountEmail = parsedCredentials.client_email;
      diagnostics.projectId = parsedCredentials.project_id;
    } catch (e: any) {
      return NextResponse.json({
        success: false,
        error: 'Invalid JSON credentials',
        message: e.message,
        diagnostics,
      }, { status: 500 });
    }

    // Try to authenticate
    const auth = new google.auth.GoogleAuth({
      credentials: parsedCredentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient as any });

    diagnostics.authenticationSuccess = true;

    // First, try to read the spreadsheet to verify access
    try {
      const metadata = await sheets.spreadsheets.get({
        spreadsheetId,
      });
      diagnostics.spreadsheetTitle = metadata.data.properties?.title;
      diagnostics.sheetTabs = metadata.data.sheets?.map(s => s.properties?.title);
    } catch (e: any) {
      return NextResponse.json({
        success: false,
        error: 'Cannot access spreadsheet - verify service account has Editor access',
        message: e.message,
        diagnostics,
        instructions: {
          step1: 'Open the Google Sheet',
          step2: 'Click Share button (top right)',
          step3: 'Add this email as Editor: service-account@example.iam.gserviceaccount.com',
          step4: 'Make sure role is "Editor" not "Viewer"',
        },
      }, { status: 500 });
    }

    // Try to write test data
    const testData = [[
      new Date().toISOString(),
      'test-cycle-' + Date.now(),
      'TEST',
      'TEST',
      'https://test.com',
      'Test Article',
      'test-provider',
      '99',
      'Testing Google Sheets connection',
      'Diagnostic test entry'
    ]];

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'ArticleLog!A:J',
      valueInputOption: 'RAW',
      requestBody: {
        values: testData,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Google Sheets connection working!',
      diagnostics,
      writeResult: {
        updatedRange: response.data.updates?.updatedRange,
        updatedRows: response.data.updates?.updatedRows,
      },
      sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 5),
    }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    // Get the admin password from environment variable
    const correctPassword = process.env.ADMIN_PASSWORD;

    if (!correctPassword) {
      console.error('[Admin Auth] ADMIN_PASSWORD not configured');
      return NextResponse.json({ error: 'Admin not configured' }, { status: 500 });
    }

    if (password === correctPassword) {
      // Set admin authentication cookie
      const cookieStore = await cookies();
      cookieStore.set('admin-auth', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 1 day (shorter than site auth for security)
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

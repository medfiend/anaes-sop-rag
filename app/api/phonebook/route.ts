import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/authGuard';
import phonebookData from '../../../data/phonebook.json';

/**
 * Trust phonebook directory. Contains real staff names, extensions and bleep
 * numbers, so it is only served to authenticated NHS staff — it must never be
 * bundled into the client JavaScript.
 */
export async function GET(req: Request) {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  return NextResponse.json(
    { success: true, contacts: phonebookData },
    {
      headers: {
        // Staff directory changes rarely; allow private browser caching only.
        'Cache-Control': 'private, max-age=3600',
      },
    }
  );
}

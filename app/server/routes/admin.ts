import { Router } from 'express';
import { desc } from 'drizzle-orm';
import { db } from '../db';
import { candidates, companies, juryMembers } from '../schema';

const router = Router();

function isAuthorized(authHeader: string | undefined, adminKey: string) {
  if (!authHeader) {
    return false;
  }

  if (authHeader === adminKey) {
    return true;
  }

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7) === adminKey;
  }

  return false;
}

router.get('/registrations', async (req, res) => {
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    return res.status(503).json({ error: 'Admin API not configured' });
  }

  const authHeader = req.get('authorization') ?? req.get('x-admin-key') ?? undefined;
  if (!isAuthorized(authHeader, adminKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const [candidateRows, companyRows, juryRows] = await Promise.all([
      db.select().from(candidates).orderBy(desc(candidates.createdAt)),
      db.select().from(companies).orderBy(desc(companies.createdAt)),
      db.select().from(juryMembers).orderBy(desc(juryMembers.createdAt)),
    ]);

    return res.json({
      counts: {
        candidates: candidateRows.length,
        companies: companyRows.length,
        juryMembers: juryRows.length,
      },
      candidates: candidateRows,
      companies: companyRows,
      juryMembers: juryRows,
    });
  } catch (error) {
    console.error('Admin registrations fetch error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { candidates } from '../schema';
import { uploadResume } from '../middleware/upload';
import { getEmailService } from '../emailService';
import { candidateConfirmationEmail, candidateNotificationEmail } from '../emailTemplates';

const router = Router();

router.post('/', (req, res) => {
  uploadResume(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const { fullName, email, phone, linkedinUrl, college, graduationYear, degreeBranch, referralSource } = req.body;
    const paymentEnabled = process.env.ENABLE_PAYMENT === 'true';

    try {
      if (!fullName || !email || !phone || !linkedinUrl) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Resume PDF is required' });
      }

      const resumePath = `/uploads/${req.file.filename}`;

      const [result] = await db.insert(candidates).values({
        fullName,
        email,
        phone,
        linkedinUrl,
        resumePath,
        college: college || null,
        graduationYear: graduationYear || null,
        degreeBranch: degreeBranch || null,
        referralSource: referralSource || null,
        paymentStatus: paymentEnabled ? 'pending' : 'completed',
      }).returning();

      // When payment is disabled, send emails immediately
      if (!paymentEnabled) {
        const emailService = await getEmailService();
        if (emailService) {
          const notificationTo = process.env.NOTIFICATION_EMAIL || 'hello@vantahire.com';
          const notification = candidateNotificationEmail(result);
          await emailService.sendEmail({ to: notificationTo, ...notification });

          const confirmation = candidateConfirmationEmail(result, { paid: false });
          await emailService.sendEmail({ to: result.email, ...confirmation });
        }
      }

      res.status(201).json({ success: true, id: result.id, paymentRequired: paymentEnabled });
    } catch (e: any) {
      if (e.code === '23505') {
        // If candidate exists with pending payment, return their ID so frontend can retry payment
        if (paymentEnabled) {
          const [existing] = await db.select().from(candidates).where(eq(candidates.email, email));
          if (existing && existing.paymentStatus === 'pending') {
            return res.status(200).json({ success: true, id: existing.id, paymentRequired: true });
          }
          if (existing && existing.paymentStatus === 'failed') {
            return res.status(200).json({ success: true, id: existing.id, paymentRequired: true });
          }
        }
        return res.status(409).json({ error: 'Email already registered' });
      }
      console.error('Candidate creation error:', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

export default router;

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // 1 year

router.get('/', (req, res) => {
  res.render('home');
});

router.get('/e/:slug', async (req, res) => {
  try {
    const event = await pool.query(
      'SELECT * FROM events WHERE public_slug = $1',
      [req.params.slug]
    );
    if (event.rows.length === 0) return res.status(404).send('Event not found');

    const ev = event.rows[0];
    if (!ev.is_active) return res.render('public/closed', { title: ev.title, event: ev });

    const questions = await pool.query(
      'SELECT * FROM questions WHERE event_id = $1 ORDER BY sort_order, id',
      [ev.id]
    );

    // Check if user already submitted (cookie stores response ID)
    const cookieName = `pulsecheck_${ev.public_slug}`;
    const existingResponseId = req.cookies[cookieName];
    let existingRatings = {};
    let existingFeedback = '';
    let isEdit = false;

    if (existingResponseId) {
      const resp = await pool.query(
        'SELECT * FROM responses WHERE id = $1 AND event_id = $2',
        [existingResponseId, ev.id]
      );
      if (resp.rows.length > 0) {
        isEdit = true;
        existingFeedback = resp.rows[0].feedback || '';
        const ratings = await pool.query(
          'SELECT question_id, value FROM ratings WHERE response_id = $1',
          [existingResponseId]
        );
        for (const r of ratings.rows) {
          existingRatings[r.question_id] = r.value;
        }
      }
    }

    res.render('public/event', {
      title: ev.title,
      event: ev,
      questions: questions.rows,
      existingRatings,
      existingFeedback,
      isEdit
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.post('/e/:slug', async (req, res) => {
  try {
    const event = await pool.query(
      'SELECT * FROM events WHERE public_slug = $1 AND is_active = true',
      [req.params.slug]
    );
    if (event.rows.length === 0) return res.status(404).send('Event not found or closed');

    const ev = event.rows[0];
    const questions = await pool.query(
      'SELECT id FROM questions WHERE event_id = $1',
      [ev.id]
    );

    const cookieName = `pulsecheck_${ev.public_slug}`;
    const existingResponseId = req.cookies[cookieName];

    const client = await pool.connect();
    let responseId;

    try {
      await client.query('BEGIN');

      // Check if this is an edit (cookie has a valid response ID)
      let isEdit = false;
      if (existingResponseId) {
        const existing = await client.query(
          'SELECT id FROM responses WHERE id = $1 AND event_id = $2',
          [existingResponseId, ev.id]
        );
        if (existing.rows.length > 0) {
          isEdit = true;
          responseId = existing.rows[0].id;
        }
      }

      if (isEdit) {
        // Update existing response
        await client.query(
          'UPDATE responses SET feedback = $1 WHERE id = $2',
          [req.body.feedback || null, responseId]
        );
        // Delete old ratings and re-insert
        await client.query(
          'DELETE FROM ratings WHERE response_id = $1',
          [responseId]
        );
      } else {
        // Create new response
        const resp = await client.query(
          'INSERT INTO responses (event_id, feedback) VALUES ($1, $2) RETURNING id',
          [ev.id, req.body.feedback || null]
        );
        responseId = resp.rows[0].id;
      }

      for (const q of questions.rows) {
        const val = parseInt(req.body[`rating_${q.id}`]);
        if (val >= 1 && val <= 5) {
          await client.query(
            'INSERT INTO ratings (response_id, question_id, value) VALUES ($1, $2, $3)',
            [responseId, q.id, val]
          );
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // Set cookie with response ID (httpOnly, 1 year expiry)
    res.cookie(cookieName, responseId, {
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax'
    });

    res.render('public/thanks', { title: 'Thank You', event: ev, isEdit: !!existingResponseId });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;

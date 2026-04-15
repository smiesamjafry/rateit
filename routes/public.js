const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

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

    res.render('public/event', { title: ev.title, event: ev, questions: questions.rows });
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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const resp = await client.query(
        'INSERT INTO responses (event_id, feedback) VALUES ($1, $2) RETURNING id',
        [ev.id, req.body.feedback || null]
      );

      for (const q of questions.rows) {
        const val = parseInt(req.body[`rating_${q.id}`]);
        if (val >= 1 && val <= 5) {
          await client.query(
            'INSERT INTO ratings (response_id, question_id, value) VALUES ($1, $2, $3)',
            [resp.rows[0].id, q.id, val]
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

    res.render('public/thanks', { title: 'Thank You', event: ev });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;

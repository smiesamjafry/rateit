const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../db/pool');

async function requireAdmin(req, res, next) {
  const token = req.query.token;
  if (!token) return res.status(403).send('Access denied');

  const result = await pool.query(
    'SELECT * FROM events WHERE id = $1 AND admin_token = $2',
    [req.params.id, token]
  );
  if (result.rows.length === 0) return res.status(403).send('Access denied');

  req.event = result.rows[0];
  next();
}

router.get('/new', (req, res) => {
  res.render('admin/new', { title: 'Create Event' });
});

router.post('/new', async (req, res) => {
  try {
    const adminToken = crypto.randomBytes(32).toString('hex');
    const publicSlug = crypto.randomBytes(4).toString('hex');

    const result = await pool.query(
      'INSERT INTO events (title, description, admin_token, public_slug) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.body.title, req.body.description || null, adminToken, publicSlug]
    );

    res.redirect(`/admin/${result.rows[0].id}?token=${adminToken}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const questions = await pool.query(
      'SELECT * FROM questions WHERE event_id = $1 ORDER BY sort_order, id',
      [req.event.id]
    );

    const responseCount = await pool.query(
      'SELECT COUNT(*) as count FROM responses WHERE event_id = $1',
      [req.event.id]
    );

    res.render('admin/dashboard', {
      title: req.event.title,
      event: req.event,
      questions: questions.rows,
      responseCount: parseInt(responseCount.rows[0].count),
      token: req.query.token,
      host: req.get('host'),
      protocol: req.protocol
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.post('/:id/questions', requireAdmin, async (req, res) => {
  try {
    const maxOrder = await pool.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM questions WHERE event_id = $1',
      [req.event.id]
    );

    await pool.query(
      'INSERT INTO questions (event_id, text, sort_order) VALUES ($1, $2, $3)',
      [req.event.id, req.body.text, maxOrder.rows[0].next]
    );

    res.redirect(`/admin/${req.event.id}?token=${req.query.token}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.post('/:id/questions/:qid/delete', requireAdmin, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM questions WHERE id = $1 AND event_id = $2',
      [req.params.qid, req.event.id]
    );

    res.redirect(`/admin/${req.event.id}?token=${req.query.token}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.post('/:id/toggle', requireAdmin, async (req, res) => {
  try {
    await pool.query(
      'UPDATE events SET is_active = NOT is_active WHERE id = $1',
      [req.event.id]
    );

    res.redirect(`/admin/${req.event.id}?token=${req.query.token}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.get('/:id/results', requireAdmin, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT q.id, q.text, q.sort_order,
             COUNT(r.id) AS total_ratings,
             ROUND(AVG(r.value)::numeric, 2) AS avg_rating,
             COUNT(CASE WHEN r.value = 1 THEN 1 END) AS stars_1,
             COUNT(CASE WHEN r.value = 2 THEN 1 END) AS stars_2,
             COUNT(CASE WHEN r.value = 3 THEN 1 END) AS stars_3,
             COUNT(CASE WHEN r.value = 4 THEN 1 END) AS stars_4,
             COUNT(CASE WHEN r.value = 5 THEN 1 END) AS stars_5
      FROM questions q
      LEFT JOIN ratings r ON r.question_id = q.id
      WHERE q.event_id = $1
      GROUP BY q.id, q.text, q.sort_order
      ORDER BY q.sort_order, q.id
    `, [req.event.id]);

    const feedbacks = await pool.query(`
      SELECT feedback, created_at
      FROM responses
      WHERE event_id = $1 AND feedback IS NOT NULL AND feedback != ''
      ORDER BY created_at DESC
    `, [req.event.id]);

    const responseCount = await pool.query(
      'SELECT COUNT(*) as count FROM responses WHERE event_id = $1',
      [req.event.id]
    );

    res.render('admin/results', {
      title: 'Results - ' + req.event.title,
      event: req.event,
      stats: stats.rows,
      feedbacks: feedbacks.rows,
      responseCount: parseInt(responseCount.rows[0].count),
      token: req.query.token
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;

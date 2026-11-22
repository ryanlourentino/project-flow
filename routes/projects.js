// Projects: a Contractor's construction projects (name, site address, phase).
// app.js only lets Contractors in. Later (Assignment #5) an order will be placed for one of these projects.
const express = require('express');
const db = require('../db');

const router = express.Router();
const NAME_MAX = 255;    // Projects.proj_name is VARCHAR(255)
const ADDRESS_MAX = 255; // Projects.proj_address is VARCHAR(255)
const PHASES = ['Planning', 'Foundation', 'Structure', 'Finishing', 'Completed']; // in construction order

// Every Contractor account has a row in Contractors; Projects point to that row, not to Users.
async function contractorIdOf(user) {
  const [rows] = await db.execute('SELECT contractor_id FROM Contractors WHERE user_id = ?', [user.user_id]);
  return rows[0] ? rows[0].contractor_id : null;
}

// The phase dropdown: every phase, with the chosen one marked.
const phaseOptions = (selected) => PHASES.map((name) => ({ name, selected: name === selected }));

// READ: the Contractor's projects, in construction order (Planning first, Completed last), then by name.
async function loadProjects(contractorId, opts = {}) {
  const [rows] = await db.execute(
    `SELECT proj_id, proj_name, proj_address, proj_phase
       FROM Projects
      WHERE contractor_id = ?
      ORDER BY FIELD(proj_phase, ${PHASES.map(() => '?').join(', ')}), proj_name`,
    [contractorId, ...PHASES]
  );
  return rows.map((p) => {
    if (p.proj_id !== opts.editId) return { ...p, isCompleted: p.proj_phase === 'Completed' };
    const typed = opts.editValues || {};
    return {
      ...p,
      editing: true,
      editName: typed.name ?? p.proj_name,
      editAddress: typed.address ?? p.proj_address ?? '',
      editPhases: phaseOptions(typed.phase ?? p.proj_phase),
    };
  });
}

// Send only the list fragment (the part HTMX swaps).
// opts: message / error, newName / newAddress / newPhase (keep the add form), editId / editValues (edit row).
async function renderList(req, res, opts = {}) {
  res.render('partials/project-list', { layout: false, ...(await pageData(req, opts)) });
}

async function pageData(req, opts = {}) {
  const projects = await loadProjects(req.contractorId, opts);
  return {
    projects,
    activeCount: projects.filter((p) => p.proj_phase !== 'Completed').length,
    message: opts.message,
    error: opts.error,
    newName: opts.newName,
    newAddress: opts.newAddress,
    newPhases: phaseOptions(opts.newPhase ?? 'Planning'),
    nameMax: NAME_MAX,
    addressMax: ADDRESS_MAX,
  };
}

// Name (required), site address (optional) and phase (one of PHASES): the same rules for adding and editing.
function cleanProject(body) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { error: 'Project name is required.' };
  if (name.length > NAME_MAX) return { error: `Project name must be at most ${NAME_MAX} characters.` };
  const address = String(body.address ?? '').trim().replace(/\s+/g, ' ');
  if (address.length > ADDRESS_MAX) return { error: `Site address must be at most ${ADDRESS_MAX} characters.` };
  const phase = String(body.phase ?? '');
  if (!PHASES.includes(phase)) return { error: 'Please choose a phase from the list.' };
  return { project: { name, address: address || null, phase } };
}

// Wrap every handler: an unexpected error is logged and a short message is sent instead of crashing.
const safe = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error('Projects error:', err);
    res.send('<div class="alert alert-danger" role="alert">Something went wrong. Please reload the page.</div>');
  }
};

// Runs before every route in this file: find the Contractor row of the logged-in user.
router.use(async (req, res, next) => {
  try {
    req.contractorId = await contractorIdOf(req.user);
    if (!req.contractorId) return res.status(403).render('forbidden', { title: 'No access' });
    next();
  } catch (err) {
    next(err);
  }
});

// Full page
router.get('/', safe(async (req, res) => {
  res.render('projects/index', { title: 'Projects', ...(await pageData(req)) });
}));

// Fragment only (used by the Cancel button)
router.get('/list', safe(async (req, res) => {
  if (!req.get('HX-Request')) return res.redirect('/projects'); // typed in the address bar
  await renderList(req, res);
}));

// CREATE
router.post('/', safe(async (req, res) => {
  const keep = { newName: req.body.name, newAddress: req.body.address, newPhase: req.body.phase };
  const { project, error } = cleanProject(req.body);
  if (error) return renderList(req, res, { error, ...keep });
  await db.execute(
    'INSERT INTO Projects (contractor_id, proj_name, proj_address, proj_phase) VALUES (?, ?, ?, ?)',
    [req.contractorId, project.name, project.address, project.phase]
  );
  await renderList(req, res, { message: `Project "${project.name}" was added.` });
}));

// Find one of the Contractor's OWN projects (another contractor's id gives "not found").
async function findOwnProject(req, id) {
  const [rows] = await db.execute(
    'SELECT proj_id, proj_name FROM Projects WHERE proj_id = ? AND contractor_id = ?',
    [id, req.contractorId]
  );
  return rows[0];
}

// Show one row as an edit form
router.get('/:id(\\d+)/edit', safe(async (req, res) => {
  if (!req.get('HX-Request')) return res.redirect('/projects');
  const project = await findOwnProject(req, Number(req.params.id));
  if (!project) return renderList(req, res, { error: 'That project no longer exists.' });
  await renderList(req, res, { editId: project.proj_id });
}));

// UPDATE
router.put('/:id(\\d+)', safe(async (req, res) => {
  const found = await findOwnProject(req, Number(req.params.id));
  if (!found) return renderList(req, res, { error: 'That project no longer exists.' });
  const { project, error } = cleanProject(req.body);
  if (error) return renderList(req, res, { error, editId: found.proj_id, editValues: req.body });
  await db.execute(
    `UPDATE Projects SET proj_name = ?, proj_address = ?, proj_phase = ?
      WHERE proj_id = ? AND contractor_id = ?`,
    [project.name, project.address, project.phase, found.proj_id, req.contractorId]
  );
  await renderList(req, res, { message: `Project "${project.name}" was saved.` });
}));

// DELETE (refused while documents still belong to the project)
router.delete('/:id(\\d+)', safe(async (req, res) => {
  const project = await findOwnProject(req, Number(req.params.id));
  if (!project) return renderList(req, res, { error: 'That project no longer exists.' });
  try {
    await db.execute('DELETE FROM Projects WHERE proj_id = ? AND contractor_id = ?', [project.proj_id, req.contractorId]);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return renderList(req, res, { error: `Cannot delete "${project.proj_name}": it still has documents or orders.` });
    }
    throw err;
  }
  await renderList(req, res, { message: `Project "${project.proj_name}" was deleted.` });
}));

module.exports = router;

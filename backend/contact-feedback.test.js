const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const test = require('node:test');
const ContactFeedback = require('./models/ContactFeedback');
const { router, cleanText } = require('./routes/contactFeedback');

const savedReadyState = mongoose.connection.readyState;
const savedAdminEmail = process.env.FEEDBACK_ADMIN_EMAIL;
const savedCreate = ContactFeedback.create;
const savedFind = ContactFeedback.find;
const savedEntries = [];

function routeHandler(path, method) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} route exists`);
  return layer.route.stack.at(-1).handle;
}

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test.before(() => {
  mongoose.connection.readyState = 1;
  process.env.FEEDBACK_ADMIN_EMAIL = 'admin@example.com';
  ContactFeedback.create = async (entry) => { savedEntries.push(entry); return entry; };
  ContactFeedback.find = () => {
    const query = {
      sort() { return this; },
      limit() { return this; },
      select() { return this; },
      async lean() { return savedEntries; },
    };
    return query;
  };
});

test.after(() => {
  mongoose.connection.readyState = savedReadyState;
  ContactFeedback.create = savedCreate;
  ContactFeedback.find = savedFind;
  if (savedAdminEmail === undefined) delete process.env.FEEDBACK_ADMIN_EMAIL;
  else process.env.FEEDBACK_ADMIN_EMAIL = savedAdminEmail;
});

test('contact messages validate and associate the authenticated account', async () => {
  const userId = new mongoose.Types.ObjectId();
  const res = responseRecorder();
  await routeHandler('/', 'post')({
    body: { type: 'contact', name: '  Alex  ', email: 'ALEX@example.com', subject: ' Help ', message: '  Please help.  ' },
    user: { _id: userId, fullName: 'Alex', email: 'alex@example.com' },
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(savedEntries.at(-1).userId, userId);
  assert.equal(savedEntries.at(-1).name, 'Alex');
  assert.equal(savedEntries.at(-1).email, 'alex@example.com');
  assert.equal(savedEntries.at(-1).message, 'Please help.');
});

test('feedback requires a valid rating and non-empty text', async () => {
  const invalidRating = responseRecorder();
  await routeHandler('/', 'post')({ body: { type: 'feedback', rating: 6, feedback: 'Nice app' } }, invalidRating);
  assert.equal(invalidRating.statusCode, 400);

  const emptyFeedback = responseRecorder();
  await routeHandler('/', 'post')({ body: { type: 'feedback', rating: 5, feedback: '  ' } }, emptyFeedback);
  assert.equal(emptyFeedback.statusCode, 400);

  const valid = responseRecorder();
  await routeHandler('/', 'post')({ body: { type: 'feedback', rating: 4, feedback: 'Useful app' } }, valid);
  assert.equal(valid.statusCode, 201);
  assert.equal(savedEntries.at(-1).rating, 4);
});

test('only the configured admin can read submissions', async () => {
  const denied = responseRecorder();
  await routeHandler('/admin', 'get')({ user: { email: 'member@example.com' } }, denied);
  assert.equal(denied.statusCode, 403);

  const allowed = responseRecorder();
  await routeHandler('/admin', 'get')({ user: { email: 'ADMIN@example.com' } }, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.payload.submissions.length, savedEntries.length);
});

test('text cleanup trims and removes control characters', () => {
  assert.equal(cleanText('  safe\u0000 text  '), 'safe text');
});

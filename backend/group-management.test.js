const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');
const mongoose = require('mongoose');

let currentUserId;
let currentGroup;
let tripDeleteCalls = 0;
let messageDeleteCalls = 0;
const adminUserId = new mongoose.Types.ObjectId();
const regularUserId = new mongoose.Types.ObjectId();
const groupId = new mongoose.Types.ObjectId();
const adminMemberId = new mongoose.Types.ObjectId();
const regularMemberId = new mongoose.Types.ObjectId();

function cachedModule(filename, exports) {
  const mock = new Module(filename);
  mock.filename = filename;
  mock.loaded = true;
  mock.exports = exports;
  require.cache[filename] = mock;
}

const authPath = require.resolve('./middleware/requireAuth');
const tripPath = require.resolve('./models/Trip');
const messagePath = require.resolve('./models/ChatMessage');
const tripRoutesPath = require.resolve('./routes/trips');
cachedModule(authPath, {
  requireAuth(req, _res, next) { req.user = { _id: currentUserId, fullName: 'Test User' }; next(); },
});
cachedModule(tripPath, {
  async findOne() { return currentGroup; },
  async deleteOne() { tripDeleteCalls += 1; return { deletedCount: 1 }; },
});
cachedModule(messagePath, {
  async deleteMany() { messageDeleteCalls += 1; return { deletedCount: 2 }; },
});
cachedModule(tripRoutesPath, {
  serializeTrip(group, viewerId) {
    return {
      id: group._id.toString(),
      isAdmin: group.members.some((member) => member.userId?.toString() === String(viewerId) && member.role === 'admin'),
      members: group.members.map((member) => ({ id: member._id.toString(), name: member.name })),
    };
  },
});

const groupRouter = require('./routes/groups');
let lastSocketActions;
groupRouter.setSocketActions({
  async removeMember(...args) { lastSocketActions = ['removeMember', ...args]; },
  async deleteGroup(...args) { lastSocketActions = ['deleteGroup', ...args]; },
});

function invokeDelete(path, params, userId) {
  const layer = groupRouter.stack.find((entry) => entry.route?.path === path && entry.route.methods.delete);
  assert.ok(layer, `DELETE ${path} route exists`);
  const handler = layer.route.stack.at(-1).handle;
  const response = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  return Promise.resolve(handler({ params, user: { _id: userId } }, response)).then(() => response);
}

function makeGroup() {
  const group = {
    _id: groupId,
    name: 'Test Group',
    groupCode: 'ABC234',
    members: [],
    formerMembers: [],
    expenses: [{ paidByMemberId: regularMemberId, paidByName: '' }],
    async save() {},
  };
  group.members.id = (id) => group.members.find((member) => member._id.toString() === String(id));
  const makeMember = (id, userId, name, role) => ({
    _id: id,
    userId,
    name,
    role,
    deleteOne() { group.members.splice(group.members.indexOf(this), 1); },
  });
  group.members.push(makeMember(adminMemberId, adminUserId, 'Admin User', 'admin'));
  group.members.push(makeMember(regularMemberId, regularUserId, 'Regular User', 'member'));
  return group;
}

test.after(() => {
  for (const filename of [authPath, tripPath, messagePath, tripRoutesPath, require.resolve('./routes/groups')]) delete require.cache[filename];
});

test('normal members cannot delete groups or remove other members', async () => {
  currentGroup = makeGroup();
  currentUserId = regularUserId;
  tripDeleteCalls = 0;
  const deleteResponse = await invokeDelete('/:groupId', { groupId: groupId.toString() }, currentUserId);
  const removeResponse = await invokeDelete('/:groupId/members/:memberId', { groupId: groupId.toString(), memberId: adminMemberId.toString() }, currentUserId);
  assert.equal(deleteResponse.statusCode, 403);
  assert.equal(removeResponse.statusCode, 403);
  assert.equal(currentGroup.members.length, 2);
  assert.equal(tripDeleteCalls, 0);
});

test('group admins can remove a member and their live socket is evicted', async () => {
  currentGroup = makeGroup();
  currentUserId = adminUserId;
  lastSocketActions = null;
  const response = await invokeDelete('/:groupId/members/:memberId', { groupId: groupId.toString(), memberId: regularMemberId.toString() }, currentUserId);
  const payload = response.payload;
  assert.equal(response.statusCode, 200);
  assert.deepEqual(currentGroup.members.map((member) => member.name), ['Admin User']);
  assert.equal(currentGroup.formerMembers[0].name, 'Regular User');
  assert.equal(currentGroup.expenses[0].paidByName, 'Regular User');
  assert.equal(payload.group.members.length, 1);
  assert.deepEqual(lastSocketActions, ['removeMember', groupId.toString(), regularUserId.toString()]);
});

test('group admins can delete a group and its messages', async () => {
  currentGroup = makeGroup();
  currentUserId = adminUserId;
  tripDeleteCalls = 0;
  messageDeleteCalls = 0;
  lastSocketActions = null;
  const response = await invokeDelete('/:groupId', { groupId: groupId.toString() }, currentUserId);
  assert.equal(response.statusCode, 200);
  assert.equal(tripDeleteCalls, 1);
  assert.equal(messageDeleteCalls, 1);
  assert.deepEqual(lastSocketActions, ['deleteGroup', groupId.toString(), [adminUserId.toString(), regularUserId.toString()]]);
});

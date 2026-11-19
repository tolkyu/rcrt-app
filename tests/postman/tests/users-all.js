const { items, total, nextCursor } = pm.response.json();
const byEmail = Object.fromEntries(items.map((u) => [u.email, u]));
pm.test('every seeded user on one page', () => {
  pm.expect(total).to.equal(items.length);
  pm.expect(nextCursor).to.equal(null);
  pm.expect(byEmail).to.include.all.keys(
    'admin@demo',
    'vasyl.tl@demo',
    'tl.crypto@demo',
    'bohdan.polishchuk@demo',
    'yuliia.petrenko@demo',
    'head.recruiter.gambling@demo',
    'finance@demo',
    'recruiter.crypto@demo',
  );
});
pm.test('derived statuses of the fixtures', () => {
  pm.expect(byEmail['bohdan.polishchuk@demo'].status).to.equal(
    'INVITE_EXPIRED',
  );
  pm.expect(byEmail['yuliia.petrenko@demo'].status).to.equal('DEACTIVATED');
  pm.expect(byEmail['vasyl.tl@demo'].status).to.equal('ACTIVE');
});
pm.collectionVariables.set('users_total', total);
pm.collectionVariables.set('admin_id', byEmail['admin@demo'].id);
pm.collectionVariables.set('vasyl_id', byEmail['vasyl.tl@demo'].id);
pm.collectionVariables.set('expired_id', byEmail['bohdan.polishchuk@demo'].id);
pm.collectionVariables.set('inactive_id', byEmail['yuliia.petrenko@demo'].id);
pm.collectionVariables.set(
  'head_recruiter_id',
  byEmail['head.recruiter.gambling@demo'].id,
);
pm.collectionVariables.set('finance_id', byEmail['finance@demo'].id);
pm.collectionVariables.set(
  'recruiter_crypto_id',
  byEmail['recruiter.crypto@demo'].id,
);
pm.collectionVariables.set(
  'gambling_id',
  byEmail['vasyl.tl@demo'].roles[0].vertical.id,
);
pm.collectionVariables.set(
  'crypto_id',
  byEmail['tl.crypto@demo'].roles[0].vertical.id,
);

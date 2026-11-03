pm.test('same rows as the first page, newest first', () => {
  const page = pm.response.json();
  const newest = JSON.parse(pm.collectionVariables.get('audit_newest_ids'));
  pm.expect(page.items.map((e) => e.id)).to.deep.equal(newest);
  pm.expect(page.nextCursor).to.be.a('string');
});

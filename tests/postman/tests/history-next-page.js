pm.test('older entry, not the first one again', () => {
  const page = pm.response.json();
  pm.expect(page.items).to.have.lengthOf(1);
  pm.expect(page.items[0].id).to.not.equal(
    pm.collectionVariables.get('history_first_id'),
  );
});

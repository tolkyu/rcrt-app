pm.test('the replay is the same draft, not a second one', () => {
  pm.expect(pm.response.json().id).to.equal(
    pm.collectionVariables.get('vacancy_draft_id'),
  );
});

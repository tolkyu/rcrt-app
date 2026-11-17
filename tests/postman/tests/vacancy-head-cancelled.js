const cancelled = pm.response.json();
pm.test('the author cancels the own draft after the refusals', () => {
  pm.expect(cancelled.id).to.equal(
    pm.collectionVariables.get('vacancy_head_draft_id'),
  );
  pm.expect(cancelled.status).to.equal('CANCELLED');
  pm.expect(cancelled.version).to.equal(2);
});

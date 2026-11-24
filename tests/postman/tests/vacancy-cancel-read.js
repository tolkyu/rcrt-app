const cancelled = pm.response.json();
pm.test('the author still reads the cancelled draft as cancelled', () => {
  pm.expect(cancelled.id).to.equal(
    pm.collectionVariables.get('vacancy_cancel_id'),
  );
  pm.expect(cancelled.status).to.equal('CANCELLED');
  pm.expect(cancelled.openedAt).to.equal(null);
});

const { items } = pm.response.json();
pm.test('pickers no longer offer the deactivated position', () => {
  pm.expect(items.map((p) => p.id)).to.not.include(
    pm.collectionVariables.get('position_a_id'),
  );
});

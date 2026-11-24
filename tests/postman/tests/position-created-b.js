const p = pm.response.json();
pm.test('the same name is free in another vertical', () => {
  pm.expect(p.verticalId).to.equal(
    pm.collectionVariables.get('position_crypto_vertical_id'),
  );
  pm.expect(p.isActive).to.equal(true);
});
pm.collectionVariables.set('position_b_id', p.id);
pm.collectionVariables.set('position_b_name', p.name);
pm.collectionVariables.set('position_b_version', p.version);

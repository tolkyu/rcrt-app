const cancelled = pm.response.json();
pm.test('closed as cancelled, never opened, version up by one', () => {
  pm.expect(cancelled.id).to.equal(
    pm.collectionVariables.get('vacancy_cancel_id'),
  );
  pm.expect(cancelled.status).to.equal('CANCELLED');
  pm.expect(cancelled.openedAt).to.equal(null);
  pm.expect(cancelled.version).to.equal(2);
});
pm.test('the author gets the normalised reason back, once (D123)', () => {
  pm.expect(cancelled.cancelReason).to.include('Потреба зникла');
  pm.expect(cancelled.cancelReason).to.include('Дубль вакансії V-0001');
  pm.expect(pm.response.text().split('Потреба зникла').length - 1).to.equal(1);
});

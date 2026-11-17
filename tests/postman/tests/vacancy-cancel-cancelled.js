const cancelled = pm.response.json();
pm.test(
  'closed as cancelled, never opened, version up by one, the reason is not echoed',
  () => {
    pm.expect(cancelled.id).to.equal(
      pm.collectionVariables.get('vacancy_cancel_id'),
    );
    pm.expect(cancelled.status).to.equal('CANCELLED');
    pm.expect(cancelled.openedAt).to.equal(null);
    pm.expect(cancelled.version).to.equal(2);
    pm.expect(pm.response.text()).to.not.include('Потреба зникла');
  },
);

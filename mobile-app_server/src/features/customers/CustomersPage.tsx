import { useState } from 'react';
import { Dialog } from 'antd-mobile';
import { useLocation } from 'react-router-dom';
import { usePermission } from '../../hooks/usePermission';
import { queryClient } from '../../lib/queryClient';
import { CustomerDetailView } from './CustomerDetailView';
import { CustomerFormView } from './CustomerFormView';
import { CustomerListView } from './CustomerListView';
import type { CustomerView } from './types';

export default function CustomersPage() {
  const location = useLocation();
  const stateId = location.state?.id;
  const [view, setView] = useState<CustomerView>(stateId ? { type: 'detail', id: stateId } : { type: 'list' });
  const canCreate = usePermission('customer:create');
  const canUpdate = usePermission('customer:edit');
  const [listKey, setListKey] = useState(0);
  if (view.type === 'detail') return <CustomerDetailView id={view.id} canEdit={canUpdate} openFollowUpOnMount={view.openFollowUp} onBack={() => setView({ type: 'list' })} onEdit={() => setView({ type: 'form', id: view.id })} />;
  if (view.type === 'form') return <CustomerFormView id={view.id} initialValues={view.initialValues} onBack={() => view.id ? setView({ type: 'detail', id: view.id }) : setView({ type: 'list' })} onSaved={() => { queryClient.removeQueries({ queryKey: ['customer'] }); setListKey((key) => key + 1); Dialog.clear(); setView({ type: 'list' }); }} />;
  return <CustomerListView key={listKey} canCreate={canCreate} onOpen={(id) => setView({ type: 'detail', id })} onQuickFollowUp={(id) => setView({ type: 'detail', id, openFollowUp: true })} onCreate={(initialValues) => setView({ type: 'form', initialValues })} />;
}
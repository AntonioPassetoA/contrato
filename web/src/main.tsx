import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import './index.css';
import PublicFormPage from '@/pages/PublicFormPage';
import AdminLoginPage from '@/pages/AdminLoginPage';
import AdminDashboardPage from '@/pages/AdminDashboardPage';
import AdminUsersPage from '@/pages/AdminUsersPage';
import VendedorPage from '@/pages/VendedorPage';
import ChangePasswordPage from '@/pages/ChangePasswordPage';
import AdminContratoConfigPage from '@/pages/AdminContratoConfigPage';
import AdminContratoEditorPage from '@/pages/AdminContratoEditorPage';
import AdminContratoPreviewPage from '@/pages/AdminContratoPreviewPage';
import AdminEmpresaPage from '@/pages/AdminEmpresaPage';

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/admin" replace /> },
  { path: '/c/:token', element: <PublicFormPage /> },
  { path: '/admin/login', element: <AdminLoginPage /> },
  { path: '/trocar-senha', element: <ChangePasswordPage /> },
  { path: '/admin', element: <AdminDashboardPage /> },
  { path: '/admin/empresa', element: <AdminEmpresaPage /> },
  { path: '/admin/contratos/:id', element: <AdminContratoConfigPage /> },
  { path: '/admin/contratos/:id/editar', element: <AdminContratoEditorPage /> },
  { path: '/admin/contratos/:id/preview', element: <AdminContratoPreviewPage /> },
  { path: '/admin/usuarios', element: <AdminUsersPage /> },
  { path: '/vendedor', element: <VendedorPage /> },
  { path: '*', element: <Navigate to="/admin" replace /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

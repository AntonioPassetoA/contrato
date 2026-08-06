import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import './index.css';
import PublicFormPage from '@/pages/PublicFormPage';
import AdminLoginPage from '@/pages/AdminLoginPage';
import AdminDashboardPage from '@/pages/AdminDashboardPage';

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/admin" replace /> },
  { path: '/c/:token', element: <PublicFormPage /> },
  { path: '/admin/login', element: <AdminLoginPage /> },
  { path: '/admin', element: <AdminDashboardPage /> },
  { path: '*', element: <Navigate to="/admin" replace /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

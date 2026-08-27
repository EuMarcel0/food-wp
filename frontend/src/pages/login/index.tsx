import { Formik, Form as FormikForm } from "formik";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Alert, Button, Input, Typography } from "antd";
import { useAuth } from "../../auth/AuthProvider";
import { FormField } from "../../components/FormField";
import { AuthLayout } from "../../layouts/AuthLayout";
import { loginSchema, type LoginValues } from "../../lib/validation";

const initialValues: LoginValues = {
  email: "",
  password: ""
};

export function LoginPage() {
  const { ready, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  return (
    <AuthLayout title='Entrar' subtitle='Use o e-mail e a senha da equipe para abrir o painel.'>
      {!ready ? (
        <Alert
          type='warning'
          showIcon
          style={{ marginBottom: 16 }}
          message='Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no frontend/.env. Sem isso o login não autentica.'
        />
      ) : null}
      <Formik
        initialValues={initialValues}
        validationSchema={loginSchema}
        onSubmit={async (values, helpers) => {
          helpers.setStatus(undefined);
          try {
            await signIn(values.email.trim(), values.password);
            navigate(from, { replace: true });
          } catch (err) {
            helpers.setStatus(err instanceof Error ? err.message : "Não foi possível entrar.");
          }
        }}
      >
        {({ isSubmitting, status }) => (
          <FormikForm>
            {status ? <Alert type='error' showIcon style={{ marginBottom: 16 }} message={status} /> : null}
            <FormField name='email' label='E-mail'>
              <Input
                type="email"
                autoComplete="email"
                spellCheck={false}
                inputMode="email"
                placeholder="voce@loja.com…"
              />
            </FormField>
            <FormField name='password' label='Senha'>
              <Input.Password autoComplete="current-password" placeholder="Sua senha…" />
            </FormField>
            <Button type='primary' htmlType='submit' block loading={isSubmitting} disabled={!ready}>
              Entrar
            </Button>
          </FormikForm>
        )}
      </Formik>
      <Typography.Paragraph className="!mt-4 !mb-0">
        Ainda não tem conta? <Link to='/cadastro'>Criar cadastro</Link>
      </Typography.Paragraph>
    </AuthLayout>
  );
}

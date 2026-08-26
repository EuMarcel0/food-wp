import { Formik, Form as FormikForm } from "formik";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, Input, Typography } from "antd";
import { useAuth } from "../../auth/AuthProvider";
import { FormField } from "../../components/FormField";
import { AuthLayout } from "../../layouts/AuthLayout";
import { signupSchema, type SignupValues } from "../../lib/validation";

const initialValues: SignupValues = {
  name: "",
  email: "",
  password: "",
  confirm: "",
};

export function SignupPage() {
  const { ready, signUp } = useAuth();
  const navigate = useNavigate();

  return (
    <AuthLayout title='Criar conta' subtitle='Cadastro simples com e-mail e senha do Supabase Auth.'>
      {!ready ? (
        <Alert
          type='warning'
          showIcon
          style={{ marginBottom: 16 }}
          message='Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no frontend/.env antes de cadastrar.'
        />
      ) : null}
      <Formik
        initialValues={initialValues}
        validationSchema={signupSchema}
        onSubmit={async (values, helpers) => {
          helpers.setStatus(undefined);
          try {
            const result = await signUp(
              values.email.trim(),
              values.password,
              values.name.trim(),
            );
            if (result === "confirm") {
              helpers.setStatus({ confirm: true });
              return;
            }
            navigate("/", { replace: true });
          } catch (err) {
            helpers.setStatus({
              error: err instanceof Error ? err.message : "Não foi possível cadastrar."
            });
          }
        }}
      >
        {({ isSubmitting, status }) => (
          <FormikForm>
            {status?.confirm ? (
              <Alert
                type='success'
                showIcon
                style={{ marginBottom: 16 }}
                message='Conta criada. Confirme o e-mail se o Supabase estiver pedindo verificação e depois faça login.'
              />
            ) : null}
            {status?.error ? <Alert type='error' showIcon style={{ marginBottom: 16 }} message={status.error} /> : null}
            <FormField name='name' label='Nome'>
              <Input autoComplete='name' placeholder='Seu nome' />
            </FormField>
            <FormField name='email' label='E-mail'>
              <Input autoComplete='email' placeholder='voce@loja.com' />
            </FormField>
            <FormField name='password' label='Senha'>
              <Input.Password autoComplete='new-password' placeholder='********' />
            </FormField>
            <FormField name='confirm' label='Confirmar senha'>
              <Input.Password autoComplete='new-password' placeholder='********' />
            </FormField>
            <Button type='primary' htmlType='submit' block loading={isSubmitting} disabled={!ready}>
              Cadastrar
            </Button>
          </FormikForm>
        )}
      </Formik>
      <Typography.Paragraph className='auth-footer'>
        Já tem conta? <Link to='/login'>Entrar</Link>
      </Typography.Paragraph>
    </AuthLayout>
  );
}

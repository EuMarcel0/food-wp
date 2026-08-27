import { useEffect, useMemo, useState } from "react";
import { Formik, Form as FormikForm } from "formik";
import { Alert, Avatar, Button, Form, Input, Modal, Upload } from "antd";
import { CameraOutlined } from "@ant-design/icons";
import { FormField } from "../components/FormField";
import { useAuth } from "../auth/AuthProvider";
import { toast } from "../lib/toast";
import { displayName, getAvatarUrl } from "../lib/profile";
import { settingsSchema, type SettingsValues } from "../lib/validation";

export function SettingsModal({
  open,
  onClose,
  onPasswordChanged,
}: {
  open: boolean;
  onClose: () => void;
  onPasswordChanged: () => void;
}) {
  const { user, updateProfile, changePassword, uploadAvatar } = useAuth();
  const [photo, setPhoto] = useState<File | null>(null);
  const preview = useMemo(() => {
    if (photo) return URL.createObjectURL(photo);
    return getAvatarUrl(user);
  }, [photo, user]);

  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(preview);
  }, [photo, preview]);

  const initialValues: SettingsValues = {
    name: displayName(user),
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  };

  return (
    <Modal
      title="Configuração"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      afterClose={() => setPhoto(null)}
    >
      <Formik
        enableReinitialize
        initialValues={initialValues}
        validationSchema={settingsSchema}
        onSubmit={async (values, helpers) => {
          helpers.setStatus(undefined);
          try {
            let avatarUrl: string | undefined;
            if (photo) avatarUrl = await uploadAvatar(photo);
            await updateProfile({
              fullName: values.name.trim(),
              avatarUrl,
            });
            if (values.currentPassword && values.newPassword) {
              await changePassword(values.currentPassword, values.newPassword);
              toast.success("Senha alterada. Entre novamente.");
              onPasswordChanged();
              return;
            }
            toast.success("Dados atualizados.");
            setPhoto(null);
            onClose();
          } catch (error) {
            helpers.setStatus(
              error instanceof Error ? error.message : "Não foi possível salvar.",
            );
          }
        }}
      >
        {({ isSubmitting, status }) => (
          <FormikForm>
            {status ? (
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: 12 }}
                message={status}
              />
            ) : null}
            <div className="mb-4 flex flex-col items-center gap-2.5">
              <Avatar src={preview} size={88} />
              <Upload
                accept="image/png,image/jpeg,image/webp"
                showUploadList={false}
                beforeUpload={(file) => {
                  if (file.size > 2 * 1024 * 1024) {
                    toast.error("A foto precisa ter no máximo 2 MB.");
                    return Upload.LIST_IGNORE;
                  }
                  setPhoto(file);
                  return false;
                }}
              >
                <Button icon={<CameraOutlined />}>Trocar foto</Button>
              </Upload>
              <span className="text-xs text-food-muted">JPG, PNG ou WEBP · até 2 MB</span>
            </div>
            <Form layout="vertical" requiredMark={false} component={false}>
              <Form.Item label="E-mail" style={{ marginBottom: 12 }}>
                <Input value={user?.email ?? ""} disabled />
              </Form.Item>
            </Form>
            <FormField name="name" label="Nome">
              <Input autoComplete="name" placeholder="Nome que aparece no painel…" />
            </FormField>
            <p className="mt-2 mb-3 text-xs font-bold uppercase tracking-wider text-food-muted">Alterar senha</p>
            <FormField name="currentPassword" label="Senha atual">
              <Input.Password autoComplete="current-password" placeholder="Necessária para trocar a senha…" />
            </FormField>
            <FormField name="newPassword" label="Nova senha">
              <Input.Password autoComplete="new-password" placeholder="Mínimo 6 caracteres…" />
            </FormField>
            <FormField name="confirmPassword" label="Confirmar nova senha">
              <Input.Password autoComplete="new-password" placeholder="Repita a nova senha…" />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button onClick={onClose}>Cancelar</Button>
              <Button type="primary" htmlType="submit" loading={isSubmitting}>
                Salvar
              </Button>
            </div>
          </FormikForm>
        )}
      </Formik>
    </Modal>
  );
}
